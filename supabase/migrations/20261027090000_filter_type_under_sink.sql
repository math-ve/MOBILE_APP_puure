-- Type de filtre « sous-évier » (3e système de la maquette « Mon eau »).
alter table public.filters drop constraint if exists filters_filter_type_check;
alter table public.filters add constraint filters_filter_type_check
  check (filter_type = any (array['robinet', 'douche', 'sous-evier', 'autre']));
