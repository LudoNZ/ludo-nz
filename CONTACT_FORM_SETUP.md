# Contact Form Setup Guide

This guide explains how to set up the contact form to send email notifications using Firebase Trigger Email extension.

## Prerequisites

1. Firebase project with Firestore enabled
2. Firebase CLI installed (`npm install -g firebase-tools`)
3. Firebase project initialized

## Setup Steps

### 1. Install Firebase Trigger Email Extension

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project (`ludos-website`)
3. Navigate to **Extensions** in the left sidebar
4. Click **Browse all extensions** or search for "Trigger Email"
5. Install the **Trigger Email** extension by Firebase
6. Configure the extension:
   - **SMTP connection URI**: You'll need to set up an SMTP service (Gmail, SendGrid, etc.)
   - **SMTP password**: Your SMTP password
   - **Email collection**: `ContactUs` (this matches our collection name)
   - **Location**: Choose your preferred region

### 2. Set Up SMTP (Choose One Option)

#### Option A: Gmail SMTP
- Use your Gmail account
- Generate an App Password: https://myaccount.google.com/apppasswords
- SMTP URI format: `smtps://your-email@gmail.com:your-app-password@smtp.gmail.com:465`

#### Option B: SendGrid
- Sign up at https://sendgrid.com/
- Create an API key
- Use SendGrid's SMTP settings

#### Option C: Other SMTP Providers
- Use any SMTP provider (Mailgun, AWS SES, etc.)
- Follow their SMTP configuration instructions

### 3. Set Environment Variables

Add your contact email to your environment variables:

**For local development** (`.env.local`):
```
CONTACT_EMAIL=your-email@example.com
```

**For Firebase Functions/Hosting** (set in Firebase Console):
1. Go to Firebase Console > Functions > Configuration
2. Add environment variable: `CONTACT_EMAIL` = `your-email@example.com`

Or use the existing `ADMIN_EMAIL` if you prefer:
```
ADMIN_EMAIL=your-email@example.com
```

### 4. Firestore Security Rules

Make sure your Firestore security rules allow writes to the `ContactUs` collection. Since this is done server-side via the API route, you may want to restrict direct client access:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Allow server-side writes only (via API route)
    match /ContactUs/{document} {
      allow read: if false; // Only readable server-side
      allow write: if false; // Only writable server-side
    }
  }
}
```

## How It Works

1. User submits the contact form
2. Form data is sent to `/api/contact` API route
3. API route validates the data and creates a document in `ContactUs` collection
4. The document structure includes:
   - `to`: Your email address
   - `message`: Email content (subject, text, html)
   - `formData`: Original form data
   - `createdAt`: Timestamp
   - `read`: Boolean flag
5. Firebase Trigger Email extension detects the new document
6. Extension sends an email to the address specified in `to` field
7. Extension may update the document with delivery status

## Document Structure

The contact form creates documents with this structure:

```javascript
{
  to: "your-email@example.com",
  message: {
    subject: "Contact Form: [Subject]",
    text: "Plain text email content",
    html: "HTML email content"
  },
  formData: {
    name: "User Name",
    email: "user@example.com",
    subject: "Subject",
    message: "Message content"
  },
  createdAt: Timestamp,
  read: false
}
```

## Testing

1. Fill out the contact form on your website
2. Submit the form
3. Check Firestore Console to see the new document in `ContactUs` collection
4. Check your email inbox for the notification
5. The extension may add fields like `delivery` or `error` to track email status

## Troubleshooting

- **No email received**: Check Firestore to see if document was created, check extension logs in Firebase Console
- **Extension not triggering**: Verify extension is installed and configured correctly
- **SMTP errors**: Check SMTP credentials and connection URI format
- **API errors**: Check server logs and ensure environment variables are set

## Additional Notes

- The extension will automatically process documents added to the `ContactUs` collection
- You can view extension logs in Firebase Console > Extensions > Trigger Email > Logs
- Consider setting up Firestore indexes if you plan to query these documents
