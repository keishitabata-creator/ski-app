/* 以前の試験で誤ってここに置かれた仲介役を、端末から取り除くためのファイル。
 * 端末に仲介役が残っていた場合、このファイルに入れ替わった時点で自分を解除する（アプリ本体はこれまでどおり仲介役なしで動く） */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.registration.unregister()));
