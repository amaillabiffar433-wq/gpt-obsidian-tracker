ALTER TABLE session_messages ADD COLUMN revision_hash TEXT;
UPDATE session_messages SET revision_hash = (SELECT hash FROM messages WHERE messages.id = session_messages.message_id);
