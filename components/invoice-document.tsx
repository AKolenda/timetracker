import type { InvoiceDocument } from "@/lib/invoice-document"

const shell = "rounded-lg border border-gray-200 bg-white px-4"
const box = `${shell} py-3.5`

/** The on-screen invoice; the PDF and the email draw the same boxes. */
export function InvoiceDocumentView({ doc }: { doc: InvoiceDocument }) {
  return (
    <div className="bg-gray-100 px-3 py-6 text-black sm:px-6 sm:py-8">
      <div className="mx-auto flex w-full max-w-[540px] flex-col gap-2.5">
        <div className="px-2 pt-1 pb-2 text-center">
          <p className="text-lg font-bold">{doc.business.name}</p>
          {doc.business.contact && (
            <p className="mt-0.5 text-xs break-words text-gray-500">{doc.business.contact}</p>
          )}
          {doc.business.address && (
            <p className="text-xs whitespace-pre-line text-gray-500">{doc.business.address}</p>
          )}
        </div>

        <div className="rounded-lg bg-black px-4 py-6 text-center text-white">
          <p className="font-mono text-3xl font-bold tracking-tight sm:text-4xl">{doc.amount}</p>
          <p className="mt-1 text-sm text-gray-300">{doc.amountNote}</p>
        </div>

        <div className="grid gap-2.5 sm:grid-cols-2">
          <div className={box}>
            <p className="text-sm font-semibold">{doc.client.name}</p>
            {doc.client.lines.map((line) => (
              <p key={line} className="text-[13px] break-words whitespace-pre-line text-gray-500">
                {line}
              </p>
            ))}
          </div>
          <div className={box}>
            <p className="font-mono text-sm font-semibold">{doc.invoice.number}</p>
            {doc.invoice.lines.map((line) => (
              <p key={line} className="text-[13px] text-gray-500">{line}</p>
            ))}
          </div>
        </div>

        {doc.items.length > 0 && (
          <div className={`${shell} py-1`}>
            {doc.items.map((item, index) => (
              <div
                key={index}
                className={`flex justify-between gap-3 border-gray-200 py-2.5 text-sm ${index ? "border-t" : ""}`}
              >
                <div className="min-w-0">
                  <p className="break-words">{item.description}</p>
                  {item.detail && (
                    <p className="font-mono text-xs text-gray-500">{item.detail}</p>
                  )}
                </div>
                <p className="shrink-0 font-mono">{item.amount}</p>
              </div>
            ))}
          </div>
        )}

        <div className={box}>
          {doc.totals.map((row) => (
            <div key={row.label} className="flex justify-between gap-3 py-0.5 text-[13px]">
              <span className="text-gray-500">{row.label}</span>
              <span className="shrink-0 font-mono">{row.value}</span>
            </div>
          ))}
          <div className="mt-1.5 flex justify-between gap-3 border-t border-gray-200 pt-2.5 text-base font-bold">
            <span>{doc.total.label}</span>
            <span className="font-mono">{doc.total.value}</span>
          </div>
          {doc.converted && (
            <>
              <div className="flex justify-between gap-3 pt-1 text-[13px]">
                <span className="text-gray-500">{doc.converted.label}</span>
                <span className="font-mono font-semibold">{doc.converted.value}</span>
              </div>
              <p className="mt-0.5 text-right text-[11px] text-gray-400">{doc.converted.note}</p>
            </>
          )}
        </div>

        {doc.notes && (
          <div className={`${box} text-[13px] whitespace-pre-line text-gray-700`}>{doc.notes}</div>
        )}

        {doc.accounts.length > 0 && (
          <div className={doc.accounts.length > 1 ? "grid gap-2.5 sm:grid-cols-2" : "grid"}>
            {doc.accounts.map((account, index) => (
              <div key={account.heading || index} className={box}>
                {account.heading && (
                  <p className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 text-sm font-semibold">
                    <span>{account.heading}</span>
                    <span className="font-mono">{account.amount}</span>
                  </p>
                )}
                <dl className="grid grid-cols-[max-content_1fr] gap-x-3.5 gap-y-1 text-[13px]">
                  {account.lines.map((line) => (
                    <div key={line.label} className="contents">
                      <dt className="text-gray-500">{line.label}</dt>
                      <dd className={`break-words ${line.mono ? "font-mono" : ""}`}>{line.value}</dd>
                    </div>
                  ))}
                </dl>
                {account.notes && (
                  <p className="mt-2 text-xs whitespace-pre-line text-gray-500">{account.notes}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
