import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, CheckCircle, DownloadSimple, ShieldCheck, ShieldWarning, Spinner } from "@phosphor-icons/react";
import { useHub, useUi } from "../../lib/store";
import { DIAG_COLOR, DIAG_NAME } from "../../lib/format";
import { verify, type Seal } from "../../lib/hash";
import { useDemo } from "../../lib/sim";
import type { Diag, Report } from "../../lib/types";
import { Bezel, CountUp } from "../kit";
import Shell, { rise } from "./Shell";

/** Re-computes the SHA-256 in the browser, exactly as server/forensic.py sealed it, so a tampered report shows as broken. */
function useSeal(r: Report): Seal | "checking" {
  const [seal, setSeal] = useState<Seal | "checking">("checking");
  useEffect(() => {
    let live = true; setSeal("checking");
    const t = setTimeout(() => verify(r).then((s) => live && setSeal(s)), 650);
    return () => { live = false; clearTimeout(t); };
  }, [r]);
  return seal;
}

function Card({ r, i }: { r: Report; i: number }) {
  const seal = useSeal(r);
  const download = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(r, null, 2)], { type: "application/json" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `${r.incident_id}.json` }); a.click(); URL.revokeObjectURL(url);
  };
  return (
    <motion.div layout initial={{ opacity: 0, y: 30, filter: "blur(10px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} transition={{ duration: 0.9, delay: 0.1 + i * 0.07, ease: [0.32, 0.72, 0, 1] }}>
      <Bezel>
        <div className="p-5 md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="mono text-[11px]" style={{ color: "var(--faint)" }}>{r.incident_id}</div>
              <div className="mt-1 text-[12.5px]" style={{ color: "var(--muted)" }}>{r.started_iso.replace("T", " · ")} · {r.duration_s.toFixed(1)} s</div>
            </div>
            <span className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-medium"
              style={{ background: seal === "ok" ? "rgba(82,224,143,.1)" : seal === "bad" ? "rgba(255,92,108,.12)" : "rgba(255,255,255,.05)", color: seal === "ok" ? "var(--good)" : seal === "bad" ? "var(--bad)" : "var(--muted)", border: "1px solid var(--hair)" }}>
              <AnimatePresence mode="wait" initial={false}>
                <motion.span key={seal} initial={{ scale: 0.4, opacity: 0, rotate: -40 }} animate={{ scale: 1, opacity: 1, rotate: 0 }} exit={{ scale: 0.4, opacity: 0 }} transition={{ type: "spring", stiffness: 400, damping: 22 }} className="flex">
                  {seal === "checking" ? <Spinner size={14} className="animate-spin" /> : seal === "ok" ? <ShieldCheck size={15} weight="fill" /> : <ShieldWarning size={15} weight="fill" />}
                </motion.span>
              </AnimatePresence>
              {seal === "checking" ? "Verifying seal" : seal === "ok" ? "Seal verified" : seal === "bad" ? "Seal broken" : "Seal unchecked"}
            </span>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            {r.diagnoses.map((d, k) => (
              <span key={d + k} className="flex items-center gap-2">
                {k > 0 && <ArrowRight size={14} weight="light" style={{ color: "var(--faint)" }} />}
                <span className="rounded-full px-3 py-1.5 text-[12px] font-semibold" style={{ background: `${DIAG_COLOR[d as Diag] ?? "#888"}1f`, color: DIAG_COLOR[d as Diag] ?? "#ccc", border: `1px solid ${DIAG_COLOR[d as Diag] ?? "#888"}40` }}>{DIAG_NAME[d as Diag] ?? d}</span>
              </span>
            ))}
          </div>

          <ul className="mt-4 space-y-1.5">
            {r.agent_actions.map((a) => <li key={a} className="flex gap-2.5 text-[13px] leading-snug"><CheckCircle size={16} weight="light" className="mt-0.5 shrink-0" style={{ color: "var(--accent)" }} />{a}</li>)}
          </ul>

          <div className="mt-5 grid grid-cols-3 gap-px overflow-hidden rounded-2xl" style={{ background: "var(--hair)" }}>
            {[["Carried by radio", r.readings_carried_by_radio, false], ["Lost", r.readings_lost, true], ["Peak confidence", Math.round(r.peak_confidence * 100), false]].map(([k, v, lost]) => (
              <div key={k as string} className="px-4 py-3" style={{ background: "rgba(10,11,16,.96)" }}>
                <div className="label !text-[9px]">{k as string}</div>
                <div className="mono mt-1 text-[22px] font-medium" style={{ color: lost ? (v === 0 ? "var(--good)" : "var(--bad)") : "var(--ink)" }}>{v as number}{k === "Peak confidence" ? "%" : ""}</div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex items-center justify-between gap-3">
            <div className="mono min-w-0 truncate text-[10.5px]" style={{ color: "var(--faint)" }} title={r.sha256}>sha256 {r.sha256}</div>
            <button onClick={download} className="pill shrink-0 !py-1.5 !pl-3.5 !pr-1.5 !text-[12px]">Export <span className="ico !h-6 !w-6"><DownloadSimple size={13} weight="light" /></span></button>
          </div>
        </div>
      </Bezel>
    </motion.div>
  );
}

export default function Incidents() {
  const reports = useHub((s) => s.snap?.reports) ?? [];
  const source = useHub((s) => s.source);
  const setView = useUi((s) => s.setView);
  const radio = reports.reduce((a, r) => a + r.readings_carried_by_radio, 0);
  const lost = reports.reduce((a, r) => a + r.readings_lost, 0);

  return (
    <Shell eyebrow="Incidents" title="Every outage," accent="sealed"
      lead="Each time the link fails, the hub writes one tamper-evident report. Your browser re-computes the SHA-256 seal on every card; change a single character in the file and it turns red.">
      <motion.div {...rise(0)} className="mb-5 grid grid-cols-3 gap-3 md:gap-4">
        {[["Incidents", reports.length, false], ["Carried by radio", radio, false], ["Readings lost", lost, true]].map(([k, v, bad]) => (
          <Bezel key={k as string} tight lit={false}><div className="p-4 md:p-5">
            <div className="label">{k as string}</div>
            <CountUp value={v as number} className="mono mt-1 block text-[30px] font-medium tracking-tight" style={{ color: bad ? ((v as number) === 0 ? "var(--good)" : "var(--bad)") : "var(--ink)", textShadow: bad && v === 0 ? "0 0 22px rgba(82,224,143,.4)" : "none" }} />
          </div></Bezel>
        ))}
      </motion.div>

      {reports.length === 0 ? (
        <motion.div {...rise(1)}>
          <Bezel><div className="grid place-items-center px-6 py-20 text-center">
            <div className="grid h-20 w-20 place-items-center rounded-full" style={{ background: "var(--accent-soft)", boxShadow: "0 0 80px -10px var(--accent)" }}><ShieldCheck size={38} weight="light" style={{ color: "var(--accent)" }} /></div>
            <h2 className="mt-6 text-[24px] font-semibold tracking-[-0.03em]">No outages <span className="serif" style={{ fontSize: "1.1em" }}>yet</span></h2>
            <p className="mt-2 max-w-[44ch] text-[13.5px] leading-relaxed" style={{ color: "var(--muted)" }}>The link has been healthy. When it breaks and recovers, the sealed report appears here.</p>
            {source === "demo" && (
              <button className="pill solid mt-7" onClick={() => { useDemo.getState().pick("fading"); setView("stage"); }}>Break the link <span className="ico"><ArrowRight size={14} weight="bold" /></span></button>
            )}
          </div></Bezel>
        </motion.div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 md:gap-5">{reports.map((r, i) => <Card key={`${r.incident_id}-${r.sha256.slice(0, 8)}`} r={r} i={i} />)}</div>
      )}
    </Shell>
  );
}
