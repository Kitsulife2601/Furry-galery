-- Remove the demo ("seed-*") accounts from 0002 with everything attached to them.
-- Likes and reports on their posts go with the posts (on delete cascade).
delete from likes where user_id like 'seed-%';
delete from follows where follower_id like 'seed-%' or following_id like 'seed-%';
delete from reports where reporter_id like 'seed-%';
delete from posts where user_id like 'seed-%';
delete from profiles where user_id like 'seed-%';
