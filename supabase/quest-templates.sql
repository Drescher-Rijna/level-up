create table if not exists public.quest_templates (
  id text primary key,
  name text not null,
  description text not null default '',
  target_hours numeric not null default 100 check (target_hours > 0),
  completion_bonus_xp integer not null default 2000 check (completion_bonus_xp >= 0),
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.quest_templates (id, name, description, target_hours, completion_bonus_xp, sort_order)
values
  ('back-seat-weight-distribution', 'Back seat weight distribution', 'Keep your weight centered and controlled through the back seat.', 100, 2000, 1),
  ('floating-on-your-tricks', 'Floating on your tricks', 'Build a lighter, more effortless feeling in your tricks.', 100, 2000, 2),
  ('keep-the-board-in-front-of-you', 'Keep the board in front of you', 'Practice staying connected to the board through the full trick.', 100, 2000, 3),
  ('separate-shoulders-and-hips', 'Separate shoulders and hips', 'Develop independent control of your shoulders and hips.', 100, 2000, 4),
  ('pinching-your-truck', 'Pinching your truck', 'Practice a consistent, controlled pinch on the truck.', 100, 2000, 5),
  ('keeping-speed-on-exit', 'Keeping speed on exit', 'Carry useful speed through the landing and exit.', 100, 2000, 6),
  ('doing-tricks-with-speed', 'Doing tricks with speed', 'Build confidence and control while practicing with speed.', 100, 2000, 7)
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  target_hours = excluded.target_hours,
  completion_bonus_xp = excluded.completion_bonus_xp,
  sort_order = excluded.sort_order,
  active = excluded.active;

alter table public.quest_templates enable row level security;

drop policy if exists "Anyone can view active quest templates" on public.quest_templates;
create policy "Anyone can view active quest templates"
  on public.quest_templates for select using (active = true);
