-- Enable RLS on realtime.messages (the table that gates Realtime channel subscriptions)
ALTER TABLE IF EXISTS realtime.messages ENABLE ROW LEVEL SECURITY;

-- Drop any prior versions of our policies so this migration is idempotent
DROP POLICY IF EXISTS "Users can read own-scoped realtime topics" ON realtime.messages;
DROP POLICY IF EXISTS "Users can send own-scoped realtime topics" ON realtime.messages;

-- Allow authenticated users to receive realtime events ONLY on topics that
-- encode their own auth.uid(). Matches the channel names used by the app:
--   listings-live-{uid}, sub:{uid}, usage:{uid}
CREATE POLICY "Users can read own-scoped realtime topics"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  realtime.topic() = ('listings-live-' || auth.uid()::text)
  OR realtime.topic() = ('sub:' || auth.uid()::text)
  OR realtime.topic() = ('usage:' || auth.uid()::text)
);

-- Same restriction for sending (broadcast/presence) on those topics
CREATE POLICY "Users can send own-scoped realtime topics"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  realtime.topic() = ('listings-live-' || auth.uid()::text)
  OR realtime.topic() = ('sub:' || auth.uid()::text)
  OR realtime.topic() = ('usage:' || auth.uid()::text)
);