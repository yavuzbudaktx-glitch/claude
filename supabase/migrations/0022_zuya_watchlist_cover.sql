-- Posters + year for the watch-together list.
alter table zuya_watchlist add column if not exists cover text;
alter table zuya_watchlist add column if not exists year text;
