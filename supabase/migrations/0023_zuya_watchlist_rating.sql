-- IMDb rating for watch-together items (shown on the poster).
alter table zuya_watchlist add column if not exists rating text;
