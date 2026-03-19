-- Clean up old sk_ key prefixes in api_keys table.
-- These were created before the slk_ rename. The keys themselves
-- still work (hash matches) but the stored prefix is stale.

UPDATE public.api_keys
SET key_prefix = 'slk_' || substring(key_prefix from 4)
WHERE key_prefix LIKE 'sk_%' AND key_prefix NOT LIKE 'slk_%';
