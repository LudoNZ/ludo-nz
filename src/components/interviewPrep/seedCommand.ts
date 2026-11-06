/** The practice seed wrapped as one shell command, for pasting straight
 * into a terminal (Termux on a tablet): it writes the SQL to seed.sql via
 * a quoted heredoc — quoted, so the shell expands nothing inside, and the
 * SQL's parentheses, `$`s and `--` comments go into the file untouched —
 * then loads that file with psql. Pasting the raw SQL into the shell
 * instead makes bash try to run every line ("syntax error near
 * unexpected token `('"). */

export const SEED_DELIMITER = "QA_SEED_END"

export const DATABASE = "qa_practice"

export function seedShellCommand(sql: string): string {
  // a heredoc ends at the first line that is exactly the delimiter
  if (sql.split("\n").some((line) => line === SEED_DELIMITER)) {
    throw new Error(`The seed contains a line "${SEED_DELIMITER}", which would end the heredoc early`)
  }
  const body = sql.endsWith("\n") ? sql : `${sql}\n`
  return [
    `createdb ${DATABASE} 2>/dev/null`,
    `cat > seed.sql <<'${SEED_DELIMITER}'`,
    `${body}${SEED_DELIMITER}`,
    `psql -d ${DATABASE} -v ON_ERROR_STOP=1 -f seed.sql`,
    "",
  ].join("\n")
}
