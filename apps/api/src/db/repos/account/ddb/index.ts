// The account lane's DynamoDB bodies for the switch: `dual('ac/index', name, …)` calls `name(store, db, ...args)` here.
/**
 * M26 lane AC. Loaded only by `dual` (src/db/backend.ts, lane LB) when the Db carries a Store — never by the
 * Postgres build. Every export has a Postgres twin of the same name in src/db/repos/account/*.ts. The bodies
 * in this folder take one `Hybrid` ({ store, pg }); `ac` adapts each to the switch's `(store, db, ...args)` and
 * remembers which Postgres Db the Store runs beside (the outbox handlers are given only the Store).
 */
import type { Db } from '../../../db.ts';
import type { Store } from '../../../ddb/store.ts';
import { rememberPg, type Hybrid } from './common.ts';
import * as L from './listeners.ts';
import * as S from './sessions.ts';
import * as C from './codes.ts';
import * as P from './profile.ts';
import * as F from './feedback.ts';
import * as U from './push.ts';
import * as D from './deletion.ts';
import * as A from './account.ts';

function ac<A extends unknown[], R>(fn: (h: Hybrid, ...a: A) => Promise<R>): (store: Store, db: Db, ...a: A) => Promise<R> {
  return (store, db, ...a) => { rememberPg(store, db); return fn({ store, pg: db }, ...a); };
}

export const createListener = ac(L.createListener);
export const listenerByEmail = ac(L.listenerByEmail);
export const recordFailedSignIn = ac(L.recordFailedSignIn);
export const clearFailedSignIns = ac(L.clearFailedSignIns);
export const recordCountry = ac(L.recordCountry);

export const deleteSessionByHash = ac(S.deleteSessionByHash);
export const insertSession = ac(S.insertSession);
export const sessionExistsRows = ac(S.sessionExistsRows);
export const rehashSession = ac(S.rehashSession);
export const rotateSessionRow = ac(S.rotateSessionRow);
export const listenerForTokenRows = ac(S.listenerForTokenRows);
export const studioSessionRows = ac(S.studioSessionRows);
export const touchSessionLastSeen = ac(S.touchSessionLastSeen);
export const sessionCreatedAtRows = ac(S.sessionCreatedAtRows);
export const deleteActAsSessions = ac(S.deleteActAsSessions);
export const insertActAsSession = ac(S.insertActAsSession);
export const actingTargetRows = ac(S.actingTargetRows);
export const secondFactorAtRows = ac(S.secondFactorAtRows);
export const markSecondFactorDone = ac(S.markSecondFactorDone);
export const secondFactorSentAtRows = ac(S.secondFactorSentAtRows);
export const storeSecondFactorCode = ac(S.storeSecondFactorCode);
export const reserveSecondFactorTry = ac(S.reserveSecondFactorTry);
export const passSecondFactor = ac(S.passSecondFactor);
export const clearSecondFactorCode = ac(S.clearSecondFactorCode);

export const codeSentAtRows = ac(C.codeSentAtRows);
export const upsertEmailCode = ac(C.upsertEmailCode);
export const reserveCodeAttempt = ac(C.reserveCodeAttempt);
export const returnCodeAttempt = ac(C.returnCodeAttempt);
export const deleteEmailCode = ac(C.deleteEmailCode);
export const bumpRateCounter = ac(C.bumpRateCounter);
export const deleteRateCountersBefore = ac(C.deleteRateCountersBefore);

export const myProfile = ac(P.myProfile);
export const updateProfile = ac(P.updateProfile);
export const avatarBytesOthers = ac(P.avatarBytesOthers);
export const currentAvatar = ac(P.currentAvatar);
export const setAvatar = ac(P.setAvatar);
export const displayNameRows = ac(P.displayNameRows);
export const acceptRules = ac(P.acceptRules);
export const passwordHashRows = ac(P.passwordHashRows);
export const listenerEmailRows = ac(P.listenerEmailRows);
export const setTz = ac(P.setTz);
export const getInterests = ac(P.getInterests);
export const setInterests = ac(P.setInterests);
export const skipInterests = ac(P.skipInterests);
export const addRecFeedback = ac(P.addRecFeedback);
export const interestsStamp = ac(P.interestsStamp);
export const playCount = ac(P.playCount);
export const placementsFor = ac(P.placementsFor);
export const replacePlacements = ac(P.replacePlacements);
export const stickerView = ac(P.stickerView);
export const getQueue = ac(P.getQueue);
export const putQueue = ac(P.putQueue);

export const createFeedback = ac(F.createFeedback);
export const imagesSentToday = ac(F.imagesSentToday);
export const feedbackImageBytes = ac(F.feedbackImageBytes);
export const recentFeedback = ac(F.recentFeedback);
export const feedbackImage = ac(F.feedbackImage);
export const sweepImages = ac(F.sweepImages);
export const recordErrors = ac(F.recordErrors);
export const recentErrors = ac(F.recentErrors);
export const sweepErrorReports = ac(F.sweepErrorReports);
export const recordServerError = ac(F.recordServerError);

export const saveToken = ac(U.saveToken);
export const deleteToken = ac(U.deleteToken);
export const setPrefs = ac(U.setPrefs);
export const getPrefs = ac(U.getPrefs);
export const sendExpo = ac(U.sendExpo);
export const fanOutNewEpisode = ac(U.fanOutNewEpisode);
export const sendPopular = ac(U.sendPopular);
export const pushFor = ac(U.pushFor);
export const pushNewStatus = ac(U.pushNewStatus);
export const runDigests = ac(U.runDigests);
export const listDigests = ac(U.listDigests);
export const listNotifyShowRows = ac(U.listNotifyShowRows);
export const setNotifyShow = ac(U.setNotifyShow);

export const requestDeletion = ac(D.requestDeletion);
export const pendingDeletion = ac(D.pendingDeletion);
export const cancelDeletion = ac(D.cancelDeletion);
export const finishDeletion = ac(D.finishDeletion);
export const deleteAccount = ac(D.deleteAccount);
export const runDueDeletions = ac(D.runDueDeletions);

export const listDeviceRows = ac(A.listDeviceRows);
export const deviceCurrentRows = ac(A.deviceCurrentRows);
export const deleteDevice = ac(A.deleteDevice);
export const signOutOtherDevices = ac(A.signOutOtherDevices);
export const pendingEmailChangeRows = ac(A.pendingEmailChangeRows);
export const saveEmailChange = ac(A.saveEmailChange);
export const takeEmailChangeTry = ac(A.takeEmailChangeTry);
export const deleteEmailChange = ac(A.deleteEmailChange);
export const switchEmail = ac(A.switchEmail);
export const exportData = ac(A.exportData);
