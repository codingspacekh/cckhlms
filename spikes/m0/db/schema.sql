-- Spike schema (mirrors src/db/schema.ts). Tests recreate it from scratch.
drop schema if exists public cascade;
create schema public;

create table "user" (
  id text primary key, name text not null, email text not null unique,
  email_verified boolean not null default false, image text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  username text unique, display_username text, role text,
  banned boolean, ban_reason text, ban_expires timestamptz
);
create table session (
  id text primary key, expires_at timestamptz not null, token text not null unique,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  ip_address text, user_agent text,
  user_id text not null references "user"(id) on delete cascade,
  impersonated_by text, last_active_at timestamptz
);
create table account (
  id text primary key, account_id text not null, provider_id text not null,
  user_id text not null references "user"(id) on delete cascade,
  access_token text, refresh_token text, id_token text,
  access_token_expires_at timestamptz, refresh_token_expires_at timestamptz,
  scope text, password text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table verification (
  id text primary key, identifier text not null, value text not null, expires_at timestamptz not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table rate_limit (id text primary key, key text not null unique, count integer not null, last_request bigint not null);
