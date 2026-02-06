-- Initial population of lifecycle materialized views
-- Required before CONCURRENTLY can be used

REFRESH MATERIALIZED VIEW dispute_lifecycle;
REFRESH MATERIALIZED VIEW payout_lifecycle;
