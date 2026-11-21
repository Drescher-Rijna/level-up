-- Idempotent setup and upgrade script. Legacy grind progress stays on the ledge
-- rows; new rail progress is initialized at zero, and flat/gap rows are untouched.

create table if not exists public.tricks_catalog (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('flat_gap', 'ledge', 'rail')),
  name text not null,
  direction text not null default 'none' check (direction in ('none', 'FS', 'BS')),
  stance text not null check (stance in ('Regular', 'Fakie', 'Nollie', 'Switch')),
  sort_order integer not null
);

alter table public.tricks_catalog
  drop constraint if exists tricks_catalog_category_check;
update public.tricks_catalog
set category = 'ledge'
where category = 'grind_slide';
alter table public.tricks_catalog
  add constraint tricks_catalog_category_check
  check (category in ('flat_gap', 'ledge', 'rail'));

create table if not exists public.user_trick_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trick_id uuid not null references public.tricks_catalog(id) on delete cascade,
  tier integer not null check (tier between 1 and 6),
  score integer not null default 0 check (score between 0 and 3),
  attempts integer not null default 0 check (attempts >= 0),
  makes integer not null default 0 check (makes between 0 and attempts),
  consecutive_makes integer not null default 0 check (consecutive_makes between 0 and 3),
  updated_at timestamptz not null default now(),
  unique (user_id, trick_id, tier)
);

alter table public.user_trick_progress
  add column if not exists attempts integer not null default 0 check (attempts >= 0);
alter table public.user_trick_progress
  add column if not exists makes integer not null default 0 check (makes between 0 and attempts);

create table if not exists public.micro_skills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  drill_description text not null,
  overlay_cue text not null,
  benchmark_test text not null,
  logged_minutes integer not null default 0 check (logged_minutes between 0 and 6000),
  benchmark_passed boolean not null default false,
  unique (user_id, name)
);

create table if not exists public.user_progression_baselines (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stance_comfort jsonb not null,
  completed_at timestamptz not null default now()
);

create unique index if not exists micro_skills_user_name
  on public.micro_skills (user_id, name);

update public.micro_skills old_skill
set name = '2. Apex Catch & Float'
where old_skill.name = '2. Apex Flip Catch'
  and not exists (
    select 1
    from public.micro_skills current_skill
    where current_skill.user_id = old_skill.user_id
      and current_skill.name = '2. Apex Catch & Float'
  );

update public.micro_skills
set drill_description = '10-min Soft Knee Tuck: Ollie & flip over a stacked obstacle, tucking both knees high to armpits and waiting until descent before pushing down.',
    overlay_cue = 'Catch at peak height with soft ankles—let gravity bring you and the board down together as one unit.'
where name = '2. Apex Catch & Float';

create table if not exists public.training_cycles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  start_date date not null default current_date,
  end_date date not null default (current_date + 13),
  status text not null default 'active' check (status in ('active', 'completed')),
  active_micro_skill_id uuid not null references public.micro_skills(id) on delete restrict,
  slot_a_progress_id uuid not null references public.user_trick_progress(id) on delete restrict,
  slot_b_progress_id uuid not null references public.user_trick_progress(id) on delete restrict,
  slot_c_progress_id uuid not null references public.user_trick_progress(id) on delete restrict,
  slot_d_progress_id uuid references public.user_trick_progress(id) on delete restrict
);

alter table public.training_cycles
  add column if not exists slot_d_progress_id uuid references public.user_trick_progress(id) on delete restrict;
alter table public.training_cycles
  drop constraint if exists training_cycles_check;
alter table public.training_cycles
  drop constraint if exists training_cycles_distinct_slots;

create unique index if not exists training_cycles_one_active_per_user
  on public.training_cycles (user_id)
  where status = 'active';

insert into public.user_progression_baselines (user_id, stance_comfort)
select distinct user_id, '{"Regular":"Solid","Fakie":"Solid","Nollie":"Solid","Switch":"Solid"}'::jsonb
from public.training_cycles
on conflict (user_id) do nothing;

create table if not exists public.training_cycle_slot_completions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  cycle_id uuid not null references public.training_cycles(id) on delete cascade,
  slot text not null check (slot in ('A', 'B', 'C', 'D')),
  progress_id uuid not null references public.user_trick_progress(id) on delete restrict,
  completed_at timestamptz not null default now(),
  unique (cycle_id, slot)
);

alter table public.training_cycle_slot_completions
  drop constraint if exists training_cycle_slot_completions_slot_check;
alter table public.training_cycle_slot_completions
  add constraint training_cycle_slot_completions_slot_check
  check (slot in ('A', 'B', 'C', 'D'));

create table if not exists public.session_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  cycle_id uuid references public.training_cycles(id) on delete set null,
  session_date date not null default current_date,
  duration_minutes integer not null default 90 check (duration_minutes between 1 and 600),
  session_type text not null check (session_type in ('high_impact', 'technical_low', 'speed_flow', 'benchmark_film')),
  filmed_diagnostic boolean not null default false,
  active_quest_work boolean not null default false,
  warmup_minutes integer not null default 0 check (warmup_minutes between 0 and 15),
  overlay_minutes integer not null default 0 check (overlay_minutes between 0 and 45),
  notes text,
  created_at timestamptz not null default now()
);

alter table public.session_logs
  add column if not exists active_quest_work boolean not null default false;
alter table public.session_logs
  add column if not exists warmup_minutes integer not null default 0 check (warmup_minutes between 0 and 15);
alter table public.session_logs
  add column if not exists overlay_minutes integer not null default 0 check (overlay_minutes between 0 and 45);

create table if not exists public.playtime_vault (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trick_name text not null,
  obstacle text,
  parent_tricks text,
  first_landed_at date not null default current_date,
  is_consistent boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.playtime_vault
  add column if not exists created_at timestamptz not null default now();

create index if not exists user_trick_progress_user_trick
  on public.user_trick_progress (user_id, trick_id, tier);
create index if not exists session_logs_user_date
  on public.session_logs (user_id, session_date desc);
create index if not exists playtime_vault_user_created
  on public.playtime_vault (user_id, created_at desc);

update public.tricks_catalog
set direction = 'none'
where category = 'flat_gap' and direction is null;

create unique index if not exists tricks_catalog_category_name_direction_stance
  on public.tricks_catalog (category, name, direction, stance);

with flat_tricks(name, trick_order) as (
  values
    ('Ollie', 1),
    ('FS 180', 2),
    ('BS 180', 3),
    ('Pop Shuvit', 4),
    ('FS Pop Shuvit', 5),
    ('Kickflip', 6),
    ('Heelflip', 7)
),
stances(name, stance_order) as (
  values ('Regular', 1), ('Fakie', 2), ('Nollie', 3), ('Switch', 4)
)
insert into public.tricks_catalog (category, name, direction, stance, sort_order)
select 'flat_gap', flat_tricks.name, 'none', stances.name,
       (flat_tricks.trick_order - 1) * 4 + stances.stance_order
from flat_tricks cross join stances
on conflict (category, name, direction, stance) do nothing;

with grind_tricks(name, trick_order) as (
  values
    ('50-50', 1),
    ('5-0', 2),
    ('Nosegrind', 3),
    ('Boardslide', 4),
    ('Lipslide', 5),
    ('Noseslide', 6),
    ('Tailslide', 7)
),
directions(name, direction_order) as (
  values ('FS', 1), ('BS', 2)
),
stances(name, stance_order) as (
  values ('Regular', 1), ('Fakie', 2), ('Nollie', 3), ('Switch', 4)
)
insert into public.tricks_catalog (category, name, direction, stance, sort_order)
select categories.name, grind_tricks.name, directions.name, stances.name,
       (grind_tricks.trick_order - 1) * 8 + (directions.direction_order - 1) * 4 + stances.stance_order
from grind_tricks
cross join directions
cross join stances
cross join (values ('ledge'), ('rail')) as categories(name)
on conflict (category, name, direction, stance) do nothing;

do $$
begin
  if (select count(*) from public.tricks_catalog where category = 'flat_gap') <> 28
     or (select count(*) from public.tricks_catalog where category = 'ledge') <> 56
     or (select count(*) from public.tricks_catalog where category = 'rail') <> 56
     or (select count(*) from public.tricks_catalog) <> 140 then
    raise exception 'The trick catalog must contain exactly 28 Flat / Gap, 56 Ledge, and 56 Rail primitives.';
  end if;
end;
$$;

create or replace function public.seed_user_progression(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_trick_progress (user_id, trick_id, tier)
  select p_user_id, tricks_catalog.id, tiers.tier
  from public.tricks_catalog
  cross join generate_series(1, 6) as tiers(tier)
  on conflict (user_id, trick_id, tier) do nothing;

  insert into public.micro_skills (user_id, name, drill_description, overlay_cue, benchmark_test)
  values
    (p_user_id, '1. High-Speed Setup', 'Push to a steady, controlled approach. Rehearse a compact crouch and foot placement on ten roll-ups.', 'Set your feet early; stay centered and commit at speed.', 'Land 8 of 10 ollies at a fast, controlled approach with a stable roll-away.'),
    (p_user_id, '2. Apex Catch & Float', '10-min Soft Knee Tuck: Ollie & flip over a stacked obstacle, tucking both knees high to armpits and waiting until descent before pushing down.', 'Catch at peak height with soft ankles—let gravity bring you and the board down together as one unit.', 'Catch 8 of 10 kickflips over the bolts while rolling at a consistent speed and ride away with control.'),
    (p_user_id, '3. Shoulder Discipline', 'Rehearse frontside and backside quarter turns while keeping shoulders aligned with the intended rotation.', 'Keep your shoulders quiet until the pop, then lead the rotation cleanly.', 'Land 8 of 10 FS/BS 180s with controlled shoulders and a straight ride-away.'),
    (p_user_id, '4. Active Pop-Out', 'Practice light, timely pop-outs from a low curb or ledge, focusing on lifting rather than kicking away.', 'Pop with intent; bring the board with you and land over the bolts.', 'Pop out cleanly and ride away on 8 of 10 low ledge or curb attempts.'),
    (p_user_id, '5. Early Target Lock', 'Before each approach, pick a visible landing point and rehearse keeping your eyes there through takeoff.', 'Find the landing early; keep your head level through contact.', 'Reach a chosen landing zone on 8 of 10 attempts without looking down at your feet.'),
    (p_user_id, '6. Impact & Roll-Out', 'Practice low-impact landings on flat: knees soft, weight centered, and roll away without stepping off.', 'Absorb with bent knees and keep rolling out under control.', 'Ride away safely from 8 of 10 controlled low-obstacle landings.'),
    (p_user_id, '7. Revert & Powerslide', 'Warm up with gradual-speed reverts and controlled, low-angle powerslides on predictable flat ground.', 'Stay low, look through the turn, and release smoothly into your line.', 'Complete 8 of 10 controlled reverts or low-speed powerslides with balance.')
  on conflict (user_id, name) do nothing;
end;
$$;

create or replace function public.handle_new_progression_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.seed_user_progression(new.id);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_progression on auth.users;
create trigger on_auth_user_created_progression
  after insert on auth.users
  for each row execute function public.handle_new_progression_user();

do $$
declare
  existing_user record;
begin
  for existing_user in select id from auth.users loop
    perform public.seed_user_progression(existing_user.id);
  end loop;
end;
$$;

update public.training_cycles cycle
set slot_d_progress_id = cycle.slot_c_progress_id,
    slot_c_progress_id = (
      select rail_progress.id
      from public.user_trick_progress rail_progress
      join public.tricks_catalog rail_trick on rail_trick.id = rail_progress.trick_id
      where rail_progress.user_id = cycle.user_id
        and rail_trick.category = 'rail'
        and rail_progress.score between 0 and 2
        and rail_progress.id not in (
          cycle.slot_a_progress_id,
          cycle.slot_b_progress_id,
          cycle.slot_c_progress_id
        )
        and (
          rail_progress.tier = 1
          or exists (
            select 1
            from public.user_trick_progress previous_tier
            where previous_tier.user_id = cycle.user_id
              and previous_tier.trick_id = rail_progress.trick_id
              and previous_tier.tier = rail_progress.tier - 1
              and previous_tier.score = 3
          )
        )
      order by rail_progress.tier, rail_trick.sort_order
      limit 1
    )
where cycle.slot_d_progress_id is null;

alter table public.training_cycles
  alter column slot_d_progress_id set not null;
alter table public.training_cycles
  add constraint training_cycles_distinct_slots
  check (
    slot_a_progress_id <> slot_b_progress_id
    and slot_a_progress_id <> slot_c_progress_id
    and slot_a_progress_id <> slot_d_progress_id
    and slot_b_progress_id <> slot_c_progress_id
    and slot_b_progress_id <> slot_d_progress_id
    and slot_c_progress_id <> slot_d_progress_id
  );

update public.training_cycle_slot_completions completion
set slot = 'D'
from public.training_cycles cycle
where completion.cycle_id = cycle.id
  and completion.slot = 'C'
  and completion.progress_id = cycle.slot_d_progress_id;

create or replace function public.complete_progression_baseline(
  p_stance_comfort jsonb,
  p_trick_assessments jsonb,
  p_skill_hours jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  assessment record;
  skill_baseline record;
  changed_rows integer;
begin
  if current_user_id is null then raise exception 'Sign in is required.'; end if;
  update public.training_cycles
  set status = 'completed'
  where user_id = current_user_id and status = 'active';

  if jsonb_typeof(p_stance_comfort) is distinct from 'object' then
    raise exception 'Rate all four stances before saving the baseline.';
  end if;
  if jsonb_object_length(p_stance_comfort) <> 4
     or exists (
       select 1 from jsonb_each_text(p_stance_comfort) as rating(key, value)
       where rating.key not in ('Regular', 'Fakie', 'Nollie', 'Switch')
          or rating.value not in ('Beginner', 'Solid', 'Advanced')
     )
     or exists (
       select 1 from (values ('Regular'), ('Fakie'), ('Nollie'), ('Switch')) stances(name)
       where not (p_stance_comfort ? stances.name)
     ) then
    raise exception 'Rate all four stances before saving the baseline.';
  end if;

  if jsonb_typeof(p_trick_assessments) is distinct from 'array' then
    raise exception 'Assess all 140 tricks before saving the baseline.';
  end if;
  if jsonb_array_length(p_trick_assessments) <> 140
     or (select count(*) from public.tricks_catalog) <> 140
     or (
       select count(distinct item.trick_id)
       from jsonb_to_recordset(p_trick_assessments) as item(trick_id uuid)
     ) <> 140
     or exists (
       select 1
       from jsonb_to_recordset(p_trick_assessments) as item(trick_id uuid)
       left join public.tricks_catalog trick on trick.id = item.trick_id
       where trick.id is null
     ) then
    raise exception 'Assess all 140 tricks before saving the baseline.';
  end if;

  if jsonb_typeof(p_skill_hours) is distinct from 'array' then
    raise exception 'Enter hours for all seven micro-skills.';
  end if;
  if jsonb_array_length(p_skill_hours) <> 7
     or (
       select count(distinct item.micro_skill_id)
       from jsonb_to_recordset(p_skill_hours) as item(micro_skill_id uuid)
     ) <> 7 then
    raise exception 'Enter hours for all seven micro-skills.';
  end if;

  for assessment in
    select * from jsonb_to_recordset(p_trick_assessments)
      as item(trick_id uuid, highest_tier integer, working_on_next boolean)
  loop
    if assessment.highest_tier is null
       or assessment.highest_tier not between 0 and 6
       or assessment.working_on_next is null
       or (assessment.highest_tier = 6 and assessment.working_on_next) then
      raise exception 'A trick assessment contains an invalid tier or work-in-progress selection.';
    end if;

    update public.user_trick_progress
    set score = case
          when tier <= assessment.highest_tier then 3
          when tier = assessment.highest_tier + 1 and assessment.working_on_next then 1
          else 0
        end,
        attempts = case when tier <= assessment.highest_tier then 3 else 0 end,
        makes = case when tier <= assessment.highest_tier then 3 else 0 end,
        consecutive_makes = case when tier <= assessment.highest_tier then 3 else 0 end,
        updated_at = now()
    where user_id = current_user_id and trick_id = assessment.trick_id;
    get diagnostics changed_rows = row_count;
    if changed_rows <> 6 then
      raise exception 'Trick progress is incomplete. Reload the app and try again.';
    end if;
  end loop;

  for skill_baseline in
    select * from jsonb_to_recordset(p_skill_hours)
      as item(micro_skill_id uuid, hours numeric)
  loop
    if skill_baseline.hours is null or skill_baseline.hours not between 0 and 50 then
      raise exception 'Micro-skill baseline hours must be between 0 and 50.';
    end if;
    update public.micro_skills
    set logged_minutes = round(skill_baseline.hours * 60)::integer
    where id = skill_baseline.micro_skill_id and user_id = current_user_id;
    get diagnostics changed_rows = row_count;
    if changed_rows <> 1 then
      raise exception 'A micro-skill was not found for this account.';
    end if;
  end loop;

  insert into public.user_progression_baselines (user_id, stance_comfort, completed_at)
  values (current_user_id, p_stance_comfort, now())
  on conflict (user_id) do update
  set stance_comfort = excluded.stance_comfort,
      completed_at = excluded.completed_at;
end;
$$;

create or replace function public.progression_is_eligible(
  p_user_id uuid,
  p_progress_id uuid,
  p_category text default null,
  p_weak_stance_only boolean default false
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_trick_progress current_progress
    join public.tricks_catalog trick on trick.id = current_progress.trick_id
    where current_progress.id = p_progress_id
      and current_progress.user_id = p_user_id
      and current_progress.score between 0 and 2
      and (p_category is null or trick.category = p_category)
      and (not p_weak_stance_only or trick.stance in ('Fakie', 'Nollie', 'Switch'))
      and (
        current_progress.tier = 1
        or exists (
          select 1
          from public.user_trick_progress previous_tier
          where previous_tier.user_id = p_user_id
            and previous_tier.trick_id = current_progress.trick_id
            and previous_tier.tier = current_progress.tier - 1
            and previous_tier.score = 3
        )
      )
  );
$$;

drop function if exists public.create_training_cycle(uuid, uuid, uuid, uuid);

create or replace function public.create_training_cycle(
  p_active_micro_skill_id uuid,
  p_slot_a_progress_id uuid,
  p_slot_b_progress_id uuid,
  p_slot_c_progress_id uuid,
  p_slot_d_progress_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  new_cycle_id uuid;
begin
  if current_user_id is null then raise exception 'Sign in is required.'; end if;
  if not exists (
    select 1 from public.user_progression_baselines where user_id = current_user_id
  ) then raise exception 'Complete your starting baseline before beginning Cycle 1.'; end if;
  update public.training_cycles
  set status = 'completed'
  where user_id = current_user_id and status = 'active' and end_date < current_date;
  if exists (select 1 from public.training_cycles where user_id = current_user_id and status = 'active') then
    raise exception 'An active training cycle already exists.';
  end if;
  if p_slot_a_progress_id = p_slot_b_progress_id
     or p_slot_a_progress_id = p_slot_c_progress_id
     or p_slot_a_progress_id = p_slot_d_progress_id
     or p_slot_b_progress_id = p_slot_c_progress_id
     or p_slot_b_progress_id = p_slot_d_progress_id
     or p_slot_c_progress_id = p_slot_d_progress_id then
    raise exception 'Choose a different trick for each quest slot.';
  end if;
  if not exists (
    select 1 from public.micro_skills
    where id = p_active_micro_skill_id and user_id = current_user_id
  ) then raise exception 'Choose one of your micro-skills.'; end if;
  if not public.progression_is_eligible(current_user_id, p_slot_a_progress_id, 'flat_gap', false) then
    raise exception 'Slot A needs an eligible Flat / Gap trick.';
  end if;
  if not public.progression_is_eligible(current_user_id, p_slot_b_progress_id, 'ledge', false) then
    raise exception 'Slot B needs an eligible Ledge trick.';
  end if;
  if not public.progression_is_eligible(current_user_id, p_slot_c_progress_id, 'rail', false) then
    raise exception 'Slot C needs an eligible Rail trick.';
  end if;
  if not public.progression_is_eligible(current_user_id, p_slot_d_progress_id, null, true) then
    raise exception 'Slot D needs an eligible Fakie, Nollie, or Switch trick.';
  end if;

  insert into public.training_cycles (
    user_id, active_micro_skill_id, slot_a_progress_id, slot_b_progress_id, slot_c_progress_id, slot_d_progress_id
  )
  values (
    current_user_id, p_active_micro_skill_id, p_slot_a_progress_id, p_slot_b_progress_id, p_slot_c_progress_id, p_slot_d_progress_id
  )
  returning id into new_cycle_id;

  return new_cycle_id;
end;
$$;

create or replace function public.replace_training_cycle_slot(
  p_cycle_id uuid,
  p_slot text,
  p_progress_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  current_cycle public.training_cycles%rowtype;
  expected_category text;
  weak_only boolean := false;
begin
  if current_user_id is null then raise exception 'Sign in is required.'; end if;
  select * into current_cycle
  from public.training_cycles
  where id = p_cycle_id and user_id = current_user_id and status = 'active' and end_date >= current_date
  for update;
  if not found then raise exception 'The active cycle was not found.'; end if;
  if p_slot is null or p_slot not in ('A', 'B', 'C', 'D') then raise exception 'Choose a valid quest slot.'; end if;

  if (
    (p_slot = 'A' and not exists (select 1 from public.user_trick_progress where id = current_cycle.slot_a_progress_id and user_id = current_user_id and score = 3))
    or (p_slot = 'B' and not exists (select 1 from public.user_trick_progress where id = current_cycle.slot_b_progress_id and user_id = current_user_id and score = 3))
    or (p_slot = 'C' and not exists (select 1 from public.user_trick_progress where id = current_cycle.slot_c_progress_id and user_id = current_user_id and score = 3))
    or (p_slot = 'D' and not exists (select 1 from public.user_trick_progress where id = current_cycle.slot_d_progress_id and user_id = current_user_id and score = 3))
  ) then
    raise exception 'Master the current slot before choosing its next quest.';
  end if;

  expected_category := case p_slot when 'A' then 'flat_gap' when 'B' then 'ledge' when 'C' then 'rail' else null end;
  weak_only := p_slot = 'D';
  if not public.progression_is_eligible(current_user_id, p_progress_id, expected_category, weak_only) then
    raise exception 'That trick is locked or does not match this quest slot.';
  end if;
  if (p_slot <> 'A' and current_cycle.slot_a_progress_id = p_progress_id)
     or (p_slot <> 'B' and current_cycle.slot_b_progress_id = p_progress_id)
     or (p_slot <> 'C' and current_cycle.slot_c_progress_id = p_progress_id)
     or (p_slot <> 'D' and current_cycle.slot_d_progress_id = p_progress_id) then
    raise exception 'Choose a trick that is not already in another slot.';
  end if;

  delete from public.training_cycle_slot_completions
  where cycle_id = p_cycle_id and slot = p_slot;

  update public.training_cycles
  set slot_a_progress_id = case when p_slot = 'A' then p_progress_id else slot_a_progress_id end,
      slot_b_progress_id = case when p_slot = 'B' then p_progress_id else slot_b_progress_id end,
      slot_c_progress_id = case when p_slot = 'C' then p_progress_id else slot_c_progress_id end,
      slot_d_progress_id = case when p_slot = 'D' then p_progress_id else slot_d_progress_id end
  where id = p_cycle_id and user_id = current_user_id;
end;
$$;

create or replace function public.record_progression_make(
  p_cycle_id uuid,
  p_progress_id uuid,
  p_quality_confirmed boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  current_cycle public.training_cycles%rowtype;
  current_progress public.user_trick_progress%rowtype;
  matched_slot text;
  next_attempts integer;
  next_makes integer;
  next_streak integer;
  next_score integer;
  cycle_is_complete boolean;
begin
  if current_user_id is null then raise exception 'Sign in is required.'; end if;
  select * into current_cycle
  from public.training_cycles
  where id = p_cycle_id and user_id = current_user_id and status = 'active' and end_date >= current_date
  for update;
  if not found then raise exception 'The active cycle was not found.'; end if;

  matched_slot := case
    when current_cycle.slot_a_progress_id = p_progress_id then 'A'
    when current_cycle.slot_b_progress_id = p_progress_id then 'B'
    when current_cycle.slot_c_progress_id = p_progress_id then 'C'
    when current_cycle.slot_d_progress_id = p_progress_id then 'D'
    else null
  end;
  if matched_slot is null then raise exception 'That trick is not an active quest.'; end if;
  if not public.progression_is_eligible(current_user_id, p_progress_id, null, false) then
    raise exception 'This trick is locked or already mastered.';
  end if;

  select * into current_progress
  from public.user_trick_progress
  where id = p_progress_id and user_id = current_user_id
  for update;
  next_attempts := current_progress.attempts + 1;
  next_makes := current_progress.makes + 1;
  next_streak := case
    when p_quality_confirmed is true then least(3, current_progress.consecutive_makes + 1)
    else 0
  end;
  next_score := case
    when next_streak >= 3 then 3
    when current_progress.score >= 2
      or (next_attempts >= 3 and next_makes >= 2 and next_makes * 2 >= next_attempts)
      then 2
    else greatest(1, current_progress.score)
  end;

  update public.user_trick_progress
  set attempts = next_attempts, makes = next_makes,
      consecutive_makes = next_streak, score = next_score, updated_at = now()
  where id = p_progress_id and user_id = current_user_id;

  if next_score = 3 then
    insert into public.training_cycle_slot_completions (user_id, cycle_id, slot, progress_id)
    values (current_user_id, current_cycle.id, matched_slot, p_progress_id)
    on conflict (cycle_id, slot) do nothing;
  end if;

  select count(*) = 4 into cycle_is_complete
  from public.training_cycle_slot_completions
  where cycle_id = current_cycle.id;

  return jsonb_build_object(
    'score', next_score,
    'consecutive_makes', next_streak,
    'slot', matched_slot,
    'cycle_completed', cycle_is_complete
  );
end;
$$;

create or replace function public.record_progression_miss(
  p_cycle_id uuid,
  p_progress_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  current_cycle public.training_cycles%rowtype;
  next_streak integer;
begin
  if current_user_id is null then raise exception 'Sign in is required.'; end if;
  select * into current_cycle
  from public.training_cycles
  where id = p_cycle_id and user_id = current_user_id and status = 'active' and end_date >= current_date
  for update;
  if not found then raise exception 'The active cycle was not found.'; end if;
  if p_progress_id not in (
    current_cycle.slot_a_progress_id,
    current_cycle.slot_b_progress_id,
    current_cycle.slot_c_progress_id,
    current_cycle.slot_d_progress_id
  ) then raise exception 'That trick is not an active quest.'; end if;

  update public.user_trick_progress
  set attempts = attempts + 1, consecutive_makes = 0, updated_at = now()
  where id = p_progress_id and user_id = current_user_id and score < 3
  returning consecutive_makes into next_streak;
  if not found then raise exception 'The active trick could not be updated.'; end if;
  return next_streak;
end;
$$;

create or replace function public.log_progression_session(
  p_duration_minutes integer,
  p_session_type text,
  p_film_diagnostic boolean,
  p_active_quest_work boolean,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  current_cycle public.training_cycles%rowtype;
  warmup_credit integer;
  overlay_credit integer;
  new_log_id uuid;
begin
  if current_user_id is null then raise exception 'Sign in is required.'; end if;
  if p_duration_minutes is null or p_duration_minutes < 1 or p_duration_minutes > 600 then
    raise exception 'Session duration must be between 1 and 600 minutes.';
  end if;
  select * into current_cycle
  from public.training_cycles
  where user_id = current_user_id and status = 'active' and end_date >= current_date
  order by start_date desc limit 1
  for update;
  if not found then raise exception 'Set up an active cycle before logging a session.'; end if;

  warmup_credit := least(15, p_duration_minutes);
  overlay_credit := case
    when p_active_quest_work then least(45, greatest(0, p_duration_minutes - warmup_credit))
    else 0
  end;

  insert into public.session_logs (
    user_id, cycle_id, duration_minutes, session_type, filmed_diagnostic,
    active_quest_work, warmup_minutes, overlay_minutes, notes
  )
  values (
    current_user_id, current_cycle.id, p_duration_minutes, p_session_type, p_film_diagnostic,
    p_active_quest_work, warmup_credit, overlay_credit, nullif(trim(p_notes), '')
  )
  returning id into new_log_id;

  update public.micro_skills
  set logged_minutes = least(6000, logged_minutes + warmup_credit + overlay_credit)
  where id = current_cycle.active_micro_skill_id and user_id = current_user_id;

  return new_log_id;
end;
$$;

create or replace function public.set_micro_skill_benchmark(
  p_micro_skill_id uuid,
  p_passed boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Sign in is required.'; end if;
  update public.micro_skills
  set benchmark_passed = p_passed
  where id = p_micro_skill_id and user_id = auth.uid();
  if not found then raise exception 'Micro-skill was not found.'; end if;
end;
$$;

alter table public.tricks_catalog enable row level security;
alter table public.user_trick_progress enable row level security;
alter table public.micro_skills enable row level security;
alter table public.user_progression_baselines enable row level security;
alter table public.training_cycles enable row level security;
alter table public.training_cycle_slot_completions enable row level security;
alter table public.session_logs enable row level security;
alter table public.playtime_vault enable row level security;

drop policy if exists "Anyone can read the trick catalog" on public.tricks_catalog;
create policy "Anyone can read the trick catalog"
  on public.tricks_catalog for select using (true);

drop policy if exists "Users can read their trick progress" on public.user_trick_progress;
create policy "Users can read their trick progress"
  on public.user_trick_progress for select using (auth.uid() = user_id);

drop policy if exists "Users can read their micro-skills" on public.micro_skills;
create policy "Users can read their micro-skills"
  on public.micro_skills for select using (auth.uid() = user_id);

drop policy if exists "Users can read their progression baseline" on public.user_progression_baselines;
create policy "Users can read their progression baseline"
  on public.user_progression_baselines for select using (auth.uid() = user_id);

drop policy if exists "Users can read their cycles" on public.training_cycles;
create policy "Users can read their cycles"
  on public.training_cycles for select using (auth.uid() = user_id);

drop policy if exists "Users can read their cycle completions" on public.training_cycle_slot_completions;
create policy "Users can read their cycle completions"
  on public.training_cycle_slot_completions for select using (auth.uid() = user_id);

drop policy if exists "Users can read their session logs" on public.session_logs;
create policy "Users can read their session logs"
  on public.session_logs for select using (auth.uid() = user_id);

drop policy if exists "Users can manage their playtime vault" on public.playtime_vault;
create policy "Users can manage their playtime vault"
  on public.playtime_vault for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant usage on schema public to anon, authenticated;
grant select on public.tricks_catalog to anon, authenticated;
grant select on public.user_trick_progress, public.micro_skills, public.training_cycles,
  public.training_cycle_slot_completions, public.session_logs to authenticated;
grant select on public.user_progression_baselines to authenticated;
grant select, insert, update, delete on public.playtime_vault to authenticated;

revoke all on function public.seed_user_progression(uuid) from public;
revoke all on function public.handle_new_progression_user() from public;
revoke all on function public.progression_is_eligible(uuid, uuid, text, boolean) from public;
revoke all on function public.complete_progression_baseline(jsonb, jsonb, jsonb) from public;
revoke all on function public.create_training_cycle(uuid, uuid, uuid, uuid, uuid) from public;
revoke all on function public.replace_training_cycle_slot(uuid, text, uuid) from public;
revoke all on function public.record_progression_make(uuid, uuid, boolean) from public;
revoke all on function public.record_progression_miss(uuid, uuid) from public;
revoke all on function public.log_progression_session(integer, text, boolean, boolean, text) from public;
revoke all on function public.set_micro_skill_benchmark(uuid, boolean) from public;
grant execute on function public.create_training_cycle(uuid, uuid, uuid, uuid, uuid) to authenticated;
grant execute on function public.complete_progression_baseline(jsonb, jsonb, jsonb) to authenticated;
grant execute on function public.replace_training_cycle_slot(uuid, text, uuid) to authenticated;
grant execute on function public.record_progression_make(uuid, uuid, boolean) to authenticated;
grant execute on function public.record_progression_miss(uuid, uuid) to authenticated;
grant execute on function public.log_progression_session(integer, text, boolean, boolean, text) to authenticated;
grant execute on function public.set_micro_skill_benchmark(uuid, boolean) to authenticated;

notify pgrst, 'reload schema';
