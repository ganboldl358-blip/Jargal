// Session undo stack (Ctrl+Z). Every UI edit pushes its batch id here; the
// full, cross-session history lives in the store and on the History page.
import { undoBatch } from '../core/store.js';
import { toast } from './kit.js';
import { tr } from '../i18n.js';

const stack = [];

export function track(res, label) {
  if (res && (res.created || res.updated || res.deleted)) stack.push({ batch: res.batch, label });
  if (stack.length > 100) stack.shift();
  return res;
}

export function undoLast() {
  const last = stack.pop();
  if (!last) {
    toast(tr({ en: 'Nothing to undo', mn: 'Буцаах өөрчлөлт алга' }), { kind: 'info' });
    return;
  }
  undoBatch(last.batch, `Undo: ${last.label || ''}`);
  toast(tr({ en: 'Undone: {x}', mn: 'Буцаалаа: {x}' }, { x: last.label || '' }), { kind: 'info' });
}

/** Mutate helper result → toast with an Undo button. */
export function doneToast(res, msg) {
  if (!res) return;
  toast(msg, {
    action: {
      label: tr({ en: 'Undo', mn: 'Буцаах' }),
      run: () => {
        undoBatch(res.batch);
        const i = stack.findIndex((s) => s.batch === res.batch);
        if (i >= 0) stack.splice(i, 1);
      },
    },
  });
}
