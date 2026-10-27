import { useState } from 'react'
export default function ConfirmDialog({title,children,onConfirm,onCancel}) {
  const [busy,setBusy]=useState(false)
  return <div className="fixed inset-0 bg-slate-900/30 flex items-center justify-center p-6 z-50" role="presentation"><div className="card max-w-md w-full" role="dialog" aria-modal="true" aria-label={title}><h2 className="font-semibold mb-3">{title}</h2><p className="text-sm text-slate-500 mb-4">{children}</p><div className="flex justify-end gap-2"><button autoFocus disabled={busy} className="btn-ghost" onClick={onCancel}>Отмена</button><button disabled={busy} className="btn-primary" onClick={async()=>{setBusy(true);try{await onConfirm()}finally{setBusy(false)}}}>Подтвердить</button></div></div></div>
}
