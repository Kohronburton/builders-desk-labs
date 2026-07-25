-- CrewUp production schema baseline
-- Apply to a dedicated development Supabase project first.

create extension if not exists pgcrypto;

create type public.member_role as enum ('owner', 'admin', 'member');
create type public.project_status as enum ('draft', 'open', 'reviewing', 'awarded', 'closed');
create type public.proposal_status as enum ('draft', 'submitted', 'shortlisted', 'accepted', 'declined', 'withdrawn');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  phone text,
  avatar_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  organization_type text not null check (organization_type in ('general_contractor', 'subcontractor')),
  description text,
  city text,
  state text,
  service_radius_miles integer,
  license_number text,
  license_status text,
  insurance_verified_at timestamptz,
  stripe_customer_id text unique,
  subscription_status text not null default 'free',
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.member_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table public.trades (
  id bigint generated always as identity primary key,
  name text not null unique,
  slug text not null unique
);

create table public.organization_trades (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  trade_id bigint not null references public.trades(id) on delete cascade,
  primary key (organization_id, trade_id)
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  description text not null,
  city text not null,
  state text not null,
  budget_min numeric(14,2),
  budget_max numeric(14,2),
  bid_due_at timestamptz,
  status public.project_status not null default 'draft',
  verified_only boolean not null default true,
  created_by uuid not null references public.profiles(id),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.project_trades (
  project_id uuid not null references public.projects(id) on delete cascade,
  trade_id bigint not null references public.trades(id),
  primary key (project_id, trade_id)
);

create table public.project_files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  uploaded_by uuid not null references public.profiles(id),
  storage_path text not null,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
  created_at timestamptz not null default now()
);

create table public.proposals (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  subcontractor_organization_id uuid not null references public.organizations(id) on delete cascade,
  submitted_by uuid not null references public.profiles(id),
  amount numeric(14,2) not null check (amount >= 0),
  duration_text text,
  note text not null,
  status public.proposal_status not null default 'submitted',
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, subcontractor_organization_id)
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.conversation_participants (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  primary key (conversation_id, organization_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_user_id uuid not null references public.profiles(id),
  body text not null check (char_length(body) between 1 and 5000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create table public.stripe_events (
  id text primary key,
  event_type text not null,
  processed_at timestamptz not null default now(),
  payload jsonb not null
);

create index projects_marketplace_idx on public.projects (status, state, city, published_at desc);
create index proposals_project_idx on public.proposals (project_id, status, submitted_at desc);
create index messages_conversation_idx on public.messages (conversation_id, created_at);

create or replace function public.is_org_member(target_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.organization_members
    where organization_id = target_org and user_id = auth.uid()
  );
$$;

create or replace function public.can_access_conversation(target_conversation uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.conversation_participants cp
    join public.organization_members om on om.organization_id = cp.organization_id
    where cp.conversation_id = target_conversation and om.user_id = auth.uid()
  );
$$;

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.projects enable row level security;
alter table public.project_files enable row level security;
alter table public.proposals enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.messages enable row level security;
alter table public.stripe_events enable row level security;

create policy "profiles are publicly readable" on public.profiles for select using (true);
create policy "users update own profile" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
create policy "organizations are publicly readable" on public.organizations for select using (true);
create policy "members update their organization" on public.organizations for update using (public.is_org_member(id));
create policy "open projects are public" on public.projects for select using (status = 'open' or public.is_org_member(organization_id));
create policy "members manage organization projects" on public.projects for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy "proposal parties can read" on public.proposals for select using (
  public.is_org_member(subcontractor_organization_id)
  or exists (select 1 from public.projects p where p.id = project_id and public.is_org_member(p.organization_id))
);
create policy "subcontractors create proposals" on public.proposals for insert with check (public.is_org_member(subcontractor_organization_id));
create policy "conversation participants read messages" on public.messages for select using (public.can_access_conversation(conversation_id));
create policy "conversation participants send messages" on public.messages for insert with check (sender_user_id = auth.uid() and public.can_access_conversation(conversation_id));

-- No client policy is intentionally created for stripe_events.
-- Stripe event processing must use the server-only service role key.

insert into public.trades (name, slug) values
  ('Electrical', 'electrical'),
  ('Roofing', 'roofing'),
  ('Drywall', 'drywall'),
  ('Plumbing', 'plumbing'),
  ('Concrete', 'concrete')
on conflict do nothing;
