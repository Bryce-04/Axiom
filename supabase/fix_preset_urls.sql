-- One-time migration: fix protocol_note URL in the Firearm Auction preset.
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query).

UPDATE auction_presets
SET protocol_note = 'Dial-In Protocol: Search GunBroker completed sales, pull the last 5, drop the high and low outliers, average the middle 3. Cross-check on True Gun Value (truegunvalue.com). Vintage pieces: also verify Proxibid / Rock Island archives.'
WHERE name = 'Firearm Auction';
