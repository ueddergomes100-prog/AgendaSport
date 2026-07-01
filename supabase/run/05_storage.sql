insert into storage.buckets (id, name, public)
values ('player-photos','player-photos', true), ('match-gallery','match-gallery', true)
on conflict (id) do nothing;
