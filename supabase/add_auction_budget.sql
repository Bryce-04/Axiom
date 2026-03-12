-- Migration: add budget column to auctions table
-- Run this in the Supabase SQL Editor on existing databases.
ALTER TABLE auctions ADD COLUMN IF NOT EXISTS budget numeric(10,2);
