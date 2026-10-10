// The social-graph lane's DynamoDB bodies for the switch: `dual('sg/index', name, …)` calls `name(store, db, ...args)` here.
/**
 * M26 lane SG. Loaded only by `dual` (src/db/backend.ts) when the Db carries a Store. Every export has a Postgres
 * twin of the same name in src/db/repos/social/*.ts (follows, activity, profiles, notifications, system-notices,
 * host-notices, mutes, muted-threads, live-listeners, playlists, friends-listening, rate-floors). The bodies take a
 * `Hybrid` ({ store, pg }); `sg` adapts each one, as lane AC's `ac` does.
 */
import type { Db } from '../../../db.ts';
import type { Store } from '../../../ddb/store.ts';
import { rememberPg } from '../../account/ddb/common.ts';
import type { Hybrid } from './common.ts';
import * as F from './follows.ts';
import * as A from './activity.ts';
import * as N from './notifications.ts';
import * as M from './mutes.ts';
import * as S from './notices.ts';
import * as L from './live.ts';
import * as P from './playlists.ts';
import * as R from './profiles.ts';
import * as W from './friends.ts';

function sg<A extends unknown[], R>(fn: (h: Hybrid, ...a: A) => Promise<R>): (store: Store, db: Db, ...a: A) => Promise<R> {
  return (store, db, ...a) => { rememberPg(store, db); return fn({ store, pg: db }, ...a); };
}

export const follow = sg(F.follow);
export const unfollow = sg(F.unfollow);
export const isFollowing = sg(F.isFollowing);
export const counts = sg(F.counts);
export const followers = sg(F.followers);
export const following = sg(F.following);
export const recentFollowRows = sg(F.recentFollowRows);
export const followInTx = sg(F.followInTx);
export const endFollowsBetween = sg(F.endFollowsBetween);

export const feedFor = sg(A.feedFor);
export const recentBy = sg(A.recentBy);

export const notify = sg(N.notify);
export const mentionedIds = sg(N.mentionedIds);
export const notifyForComment = sg(N.notifyForComment);
export const listNotifications = sg(N.listNotifications);
export const markSeen = sg(N.markSeen);

export const mute = sg(M.mute);
export const unmute = sg(M.unmute);
export const mutedIdsFor = sg(M.mutedIdsFor);
export const listMutes = sg(M.listMutes);
export const muteStamp = sg(M.muteStamp);
export const muteThread = sg(M.muteThread);
export const unmuteThread = sg(M.unmuteThread);
export const listMutedThreads = sg(M.listMutedThreads);

export const insertNotice = sg(S.insertNotice);
export const noticesFor = sg(S.noticesFor);
export const broadcastNotices = sg(S.broadcastNotices);
export const deleteNotice = sg(S.deleteNotice);
export const pushNotice = sg(S.pushNotice);
export const hostNotices = sg(S.hostNotices);

export const heartbeat = sg(L.heartbeat);
export const listeningNow = sg(L.listeningNow);

export const myPlaylists = sg(P.myPlaylists);
export const playlistsOf = sg(P.playlistsOf);
export const createPlaylist = sg(P.createPlaylist);
export const updatePlaylist = sg(P.updatePlaylist);
export const deletePlaylist = sg(P.deletePlaylist);
export const setItems = sg(P.setItems);
export const addItem = sg(P.addItem);
export const getPlaylist = sg(P.getPlaylist);

export const oftenListened = sg(R.oftenListened);
export const setHideOftenListened = sg(R.setHideOftenListened);
export const setPrivateListening = sg(R.setPrivateListening);
export const hostOf = sg(R.hostOf);
export const subscriptionsVisible = sg(R.subscriptionsVisible);
export const profile = sg(R.profile);

export const friendsListeningRows = sg(W.friendsListeningRows);

/** For lanes SC / ST / LB (called from their DynamoDB bodies, no Postgres twin): the activity log's writers. */
export { recordActivity, removeActivityByRef, onListened } from './activity.ts';
