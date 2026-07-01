alter table matches
drop constraint if exists matches_pickup_id_fkey;

alter table matches
add constraint matches_pickup_id_fkey
foreign key (pickup_id)
references pickups(id)
on delete cascade;
