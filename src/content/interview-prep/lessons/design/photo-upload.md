## Explanation

**The case:** *"Inspectors attach several photos to each checklist item as evidence. Sites often have one bar of 3G. Design the upload."*

Photos are where QA apps feel slow or lose data. A modern phone photo is several megabytes, a busy inspection produces dozens, and reception drops mid-upload. In Firebase you'd have used `uploadBytesResumable` and Storage rules. Here you design the pieces explicitly.

**Requirements to confirm:** Must evidence survive the phone being lost before upload? (It can't, so the UI must make pending uploads obvious.) Full resolution needed for disputes, or is a resized version enough? (Usually keep the original, and show thumbnails.) How soon must the office see photos? Retention period? Any EXIF location or time requirements? Who may view photos: same company only, the client's reps?

**The flow:**

1. **Capture and store locally first.** The photo goes into the device's local store with a client-generated `photoId` (UUID) and metadata: response or op id, `takenAt` (device time), dimensions, content type. It's linked to the response in the local outbox. The inspector can keep working.
2. **Optionally downscale on the device** to a sensible maximum (for example, a long edge of 2,500 px) if the product accepts it. That's a big saving on 3G. Keep the original if disputes need it, and say this is a product decision.
3. **Ask the API for an upload URL**: `POST /photos/upload-url { photoId, responseOpId, contentType, sizeBytes }`. The server checks tenant, permissions and size limits, creates a `photos` row with status `pending` and a deterministic key such as `companies/1/projects/2/photos/<photoId>.jpg`, and returns a short-lived **presigned PUT** URL. Because the key derives from `photoId`, a retried request gets the *same* key, so there are no duplicates.
4. **Upload directly to S3** from the device, not through Lambda. API Gateway and Lambda have payload limits and you'd pay for the waiting. For large files or very poor links, use **multipart upload** (presigned URLs per part, each part retryable) so a drop doesn't restart from zero.
5. **Confirm**: S3 emits an event when the object is created → a queue → a small Lambda marks the row `uploaded`, records the size, and enqueues **thumbnail generation**. Or the client calls `POST /photos/:id/complete`. Server-side confirmation is more robust, because it doesn't depend on the device surviving.
6. **Read**: thumbnails in lists, the original on tap, both via short-lived **presigned GET** URLs issued after an authorisation check. The bucket stays private and has no public URLs. Consider CloudFront for faster delivery.

**Failure modes:**

| What happens | Handling |
| --- | --- |
| Signal drops mid-upload | Retry with backoff from the outbox. Multipart resumes per part. The URL may expire, so the client requests a fresh one for the same `photoId`. |
| Retry after a success the client didn't hear about | Same key, so the PUT overwrites identical bytes. The DB row is keyed by `photoId`, so no duplicate. |
| Row created, upload never arrives | Status stays `pending`. A sweeper alerts or cleans up after N days, and the UI shows "not uploaded" to the inspector. |
| Upload arrives, row missing (bug) | The S3 event handler finds no row: log, alarm, and quarantine the object. Lifecycle rules on an `incoming/` prefix delete strays. |
| Huge or wrong file type | Server-side size check when issuing the URL, a content-type condition, and post-upload validation in the thumbnail worker. |
| Tenant leakage | Keys namespaced by company, *and* authorisation checks before issuing any URL. The namespace alone isn't security. |

**Data model addition:** `photos.status` (`pending` → `uploaded` → `processed`, or `failed`), `photos.client_photo_id uuid UNIQUE`, `taken_at` vs `uploaded_at`, and a partial index on pending photos for the sweeper.

## Worked example

Adding upload state to the seed's `photos` table, and the queries the sweeper and the UI need:

```sql
ALTER TABLE photos
  ADD COLUMN status text NOT NULL DEFAULT 'uploaded'
    CHECK (status IN ('pending', 'uploaded', 'processed', 'failed')),
  ADD COLUMN client_photo_id uuid UNIQUE;

CREATE INDEX photos_pending_idx ON photos (uploaded_at) WHERE status = 'pending';

-- the device asks for an upload URL: create (or find) the pending row idempotently
INSERT INTO photos (response_id, storage_key, uploaded_by, status, client_photo_id, taken_at)
VALUES (1, 'companies/1/projects/1/photos/9f1c2d3e-0000-4000-8000-000000000001.jpg', 6, 'pending',
        '9f1c2d3e-0000-4000-8000-000000000001', now() - interval '3 hours')
ON CONFLICT (client_photo_id) DO UPDATE SET status = photos.status   -- no-op that still returns the row
RETURNING id, storage_key, status;
```

`ON CONFLICT … DO UPDATE SET status = photos.status` is a common trick: it changes nothing, but unlike `DO NOTHING` it makes `RETURNING` give back the *existing* row, so a retried request gets the same key and id. The default `'uploaded'` keeps the existing seed rows valid. Adding a column with a constant default is fast in modern Postgres, with no table rewrite.

## Exercises

### The sweeper query [1]

Using the columns above, write the query a nightly job runs: photos still `pending` more than 2 days after their row was created, with project code and uploader, oldest first. (Create the column and one old pending photo in the same script so you can see a result.)

#### Solution

```sql
ALTER TABLE photos
  ADD COLUMN status text NOT NULL DEFAULT 'uploaded'
    CHECK (status IN ('pending', 'uploaded', 'processed', 'failed'));

UPDATE photos SET status = 'pending', uploaded_at = now() - interval '3 days' WHERE id = 5;

SELECT ph.id, p.code AS project, u.full_name AS uploader, ph.storage_key, ph.uploaded_at
FROM photos ph
JOIN responses r       ON r.id = ph.response_id
JOIN lot_checklists lc ON lc.id = r.lot_checklist_id
JOIN lots l            ON l.id = lc.lot_id
JOIN projects p        ON p.id = l.project_id
JOIN users u           ON u.id = ph.uploaded_by
WHERE ph.status = 'pending'
  AND ph.uploaded_at < now() - interval '2 days'
ORDER BY ph.uploaded_at;
```

Here `uploaded_at` doubles as "row created". In a real design you'd add a separate `created_at` so the meaning is clear. Spotting that naming problem is a good review comment.

### Why not upload through the API? [1]

Give three reasons not to send photo bytes through API Gateway and Lambda, and the one situation where you might.

#### Solution

(1) Request size limits on API Gateway and Lambda payloads make large photos fail outright. (2) You pay for Lambda time while it waits on a slow 3G upload, and concurrency fills up with idle uploads. (3) Retrying is all-or-nothing, where S3 multipart lets you resume. Also, S3 is built for exactly this. You might proxy through the API when you must inspect or transform bytes *before* storage (for example, strict malware scanning before anything lands), but even then, uploading to a quarantine bucket and processing asynchronously is usually better.

### Thumbnails without losing photos [2]

Design the thumbnail pipeline: trigger, idempotency, failure handling, and how the UI behaves before thumbnails exist.

#### Solution

Trigger: S3 `ObjectCreated` events on the originals prefix → SQS (buffering and retries) → a thumbnail Lambda. Idempotency: the thumbnail key derives from the original key (`…/<photoId>.thumb.jpg`), so reprocessing overwrites the same object, and the DB update `SET status = 'processed' WHERE id = $1 AND status = 'uploaded'` is safe to repeat. Failures: partial batch responses, a DLQ after 3 attempts, an alarm on DLQ depth, and `status = 'failed'` for corrupt images so they're visible. Never delete the original on failure. UI: until `processed`, show a placeholder with "processing", or load the original at a reduced display size. Never show a broken image. The *original* is the evidence and the thumbnail is a convenience, so the pipeline can fail without losing anything important.

## Say it aloud

"How would you design photo uploads for inspectors on a poor connection?"

#### Model answer

The photo is saved on the device first with a client-generated id and linked to the response in a local outbox, so the inspector can keep working. To upload, the app asks my API for a presigned PUT URL. The API checks permissions and size, creates a pending photo row, and derives the S3 key from that client id, so a retried request gets the same key and never creates duplicates. The bytes go straight to S3, not through Lambda, because of payload limits and paying for idle time on slow links. On really poor connections I'd use multipart upload so a dropout resumes rather than restarts. An S3 event via SQS marks the photo uploaded and triggers thumbnail generation, with a dead-letter queue and alarms, and the original is never at risk if processing fails. The bucket is private, and viewing uses short-lived presigned GETs after an authorisation check, with keys namespaced by company. A nightly sweeper flags photos stuck in pending. Most importantly, the app shows clearly which photos are still only on the phone, because for a site team that's the real risk.
