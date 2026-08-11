import { useState, useEffect, useCallback, useRef } from "react";
import * as XLSX from "xlsx";
import Papa from "papaparse";
import { loadBatches, saveBatch, updateBatchMeta, updateBatchItem, updateBatchItems, deleteBatchFromDB, deleteAllBatches, uploadSignature } from "./firebase.js";

const STATUS = { PENDING: "pendiente", DELIVERED: "entregado", VERIFIED: "verificado", REJECTED: "rechazado" };
const STATUS_COLORS = {
  [STATUS.PENDING]: { bg: "#FEF3C7", text: "#92400E", dot: "#F59E0B" },
  [STATUS.DELIVERED]: { bg: "#DBEAFE", text: "#1E40AF", dot: "#3B82F6" },
  [STATUS.VERIFIED]: { bg: "#D1FAE5", text: "#065F46", dot: "#10B981" },
  [STATUS.REJECTED]: { bg: "#FEE2E2", text: "#991B1B", dot: "#EF4444" },
};
const TAG_COLORS = {
  "Etiqueta Roja": { bg: "#FEE2E2", text: "#DC2626", border: "#FECACA" },
  "Etiqueta Blanca": { bg: "#F1F5F9", text: "#475569", border: "#E2E8F0" },
};

function StatusBadge({ status }) {
  const c = STATUS_COLORS[status] || STATUS_COLORS[STATUS.PENDING];
  return (<span style={{ background: c.bg, color: c.text, padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" }}>
    <span style={{ width: 6, height: 6, borderRadius: "50%", background: c.dot, display: "inline-block" }} />{status.charAt(0).toUpperCase() + status.slice(1)}
  </span>);
}
function TagBadge({ tipo }) {
  const c = TAG_COLORS[tipo] || TAG_COLORS["Etiqueta Blanca"];
  return (<span style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}`, padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 600, whiteSpace: "nowrap" }}>
    {tipo === "Etiqueta Roja" ? "🔴" : "⚪"} {tipo || "—"}
  </span>);
}

function SignaturePad({ onSave, onCancel }) {
  const canvasRef = useRef(null);
  const [drawing, setDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const getPos = (e) => { const rect = canvasRef.current.getBoundingClientRect(); const t = e.touches ? e.touches[0] : e; return { x: (t.clientX - rect.left) * (canvasRef.current.width / rect.width), y: (t.clientY - rect.top) * (canvasRef.current.height / rect.height) }; };
  const startDraw = (e) => { e.preventDefault(); const ctx = canvasRef.current.getContext("2d"); const p = getPos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); setDrawing(true); };
  const draw = (e) => { if (!drawing) return; e.preventDefault(); const ctx = canvasRef.current.getContext("2d"); const p = getPos(e); ctx.lineTo(p.x, p.y); ctx.strokeStyle = "#1E293B"; ctx.lineWidth = 2.5; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.stroke(); setHasDrawn(true); };
  const stopDraw = () => setDrawing(false);
  const clear = () => { canvasRef.current.getContext("2d").clearRect(0, 0, canvasRef.current.width, canvasRef.current.height); setHasDrawn(false); };
  return (
    <div>
      <canvas ref={canvasRef} width={280} height={120}
        style={{ border: "1px solid #CBD5E1", borderRadius: 8, width: "100%", height: 130, touchAction: "none", cursor: "crosshair", background: "#FAFBFC" }}
        onMouseDown={startDraw} onMouseMove={draw} onMouseUp={stopDraw} onMouseLeave={stopDraw}
        onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={stopDraw} />
      <p style={{ margin: "4px 0 8px", fontSize: 10, color: "#94A3B8", textAlign: "center" }}>Firma con dedo o mouse</p>
      <div style={{ display: "flex", gap: 6 }}>
        <button onClick={clear} style={{ flex: 1, padding: 7, background: "#F1F5F9", color: "#64748B", border: "none", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>Borrar</button>
        <button onClick={onCancel} style={{ flex: 1, padding: 7, background: "#FEE2E2", color: "#991B1B", border: "none", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>Cancelar</button>
        <button onClick={() => hasDrawn && onSave(canvasRef.current.toDataURL("image/jpeg", 0.3))} disabled={!hasDrawn}
          style={{ flex: 1, padding: 7, background: hasDrawn ? "#3B82F6" : "#CBD5E1", color: "#fff", border: "none", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: hasDrawn ? "pointer" : "not-allowed" }}>Confirmar</button>
      </div>
    </div>
  );
}

function SectionDeliveryModal({ section, batchId, onConfirm, onCancel }) {
  const [name, setName] = useState("");
  const [showSig, setShowSig] = useState(false);
  const [sig, setSig] = useState(null);
  const [saving, setSaving] = useState(false);
  const confirm = async () => {
    if (!name.trim()) return alert("Escribe el nombre de quien recibe");
    if (!sig) return alert("Se requiere la firma");
    setSaving(true);
    const sigUrl = await uploadSignature(batchId, section.name, sig);
    onConfirm({ receiverName: name.trim(), signature: sigUrl, deliveredAt: new Date().toLocaleString("es-MX", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" }), deliveredTimestamp: Date.now() });
    setSaving(false);
  };
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }}>
      <div style={{ background: "#fff", borderRadius: 14, padding: 18, width: "100%", maxWidth: 400, maxHeight: "90vh", overflowY: "auto" }}>
        <h3 style={{ margin: "0 0 2px", fontSize: 15, fontWeight: 700 }}>📦 Entrega de Sección</h3>
        <div style={{ margin: "0 0 14px", padding: "8px 10px", background: "#EFF6FF", borderRadius: 8, fontSize: 13, fontWeight: 700, color: "#1E40AF" }}>
          📍 {section.name} <span style={{ fontWeight: 400, fontSize: 12, color: "#64748B" }}>— {section.items.length} productos</span>
        </div>
        <label style={{ fontSize: 12, fontWeight: 600, color: "#475569", display: "block", marginBottom: 4 }}>¿Quién recibe esta sección?</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Nombre del vendedor / encargado"
          style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #E2E8F0", fontSize: 13, boxSizing: "border-box", outline: "none", marginBottom: 12 }} />
        <label style={{ fontSize: 12, fontWeight: 600, color: "#475569", display: "block", marginBottom: 6 }}>Firma de recibido</label>
        {!sig ? (showSig ? <SignaturePad onSave={(s) => { setSig(s); setShowSig(false); }} onCancel={() => setShowSig(false)} />
          : <button onClick={() => setShowSig(true)} style={{ width: "100%", padding: 14, background: "#F8FAFC", border: "2px dashed #CBD5E1", borderRadius: 8, cursor: "pointer", fontSize: 13, color: "#64748B" }}>✍️ Toca aquí para firmar</button>
        ) : (
          <div style={{ textAlign: "center" }}>
            <img src={sig} alt="Firma" style={{ height: 60, border: "1px solid #E2E8F0", borderRadius: 8, background: "#FAFBFC" }} />
            <button onClick={() => { setSig(null); setShowSig(true); }} style={{ display: "block", margin: "4px auto 0", background: "none", border: "none", color: "#3B82F6", fontSize: 11, cursor: "pointer", fontWeight: 600 }}>Cambiar firma</button>
          </div>
        )}
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button onClick={onCancel} disabled={saving} style={{ flex: 1, padding: 10, background: "#F1F5F9", color: "#64748B", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Cancelar</button>
          <button onClick={confirm} disabled={saving} style={{ flex: 1, padding: 10, background: "#3B82F6", color: "#fff", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", opacity: saving ? 0.6 : 1 }}>
            {saving ? "Guardando..." : "✅ Confirmar Entrega"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SectionReceipt({ delivery }) {
  if (!delivery) return null;
  return (
    <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 8, padding: "8px 10px", marginBottom: 6 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        {delivery.signature && <img src={delivery.signature} alt="Firma" style={{ height: 36, borderRadius: 4, border: "1px solid #BBF7D0", background: "#fff" }} />}
        <div>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: "#065F46" }}>📝 {delivery.receiverName}</p>
          <p style={{ margin: "1px 0 0", fontSize: 10, color: "#64748B" }}>{delivery.deliveredAt}</p>
        </div>
      </div>
    </div>
  );
}

const TABS = ["cargar", "seguimiento", "auditoría", "historial"];

function normalizeHeader(h) { return (h || "").toString().trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); }

function parseFileData(rows) {
  if (!rows || rows.length === 0) return [];
  const headers = Object.keys(rows[0]).map(h => ({ original: h, norm: normalizeHeader(h) }));
  const find = (...terms) => headers.find(h => terms.some(t => h.norm.includes(t)));
  const skuH = find("sku", "codigo"); const modelH = find("modelo", "producto", "nombre", "descripcion");
  const prevH = find("precio ant", "anterior", "viejo"); const newH = find("precio actual", "precio nuevo", "nuevo", "actual");
  const colorH = find("color"); const tallaH = find("talla", "seccion", "section", "size");
  const cantH = find("cantidad", "qty", "cant"); const tipoH = find("tipo", "etiqueta", "tag");
  if (!modelH && !skuH) return [];
  return rows.map((row, i) => ({
    id: Date.now() + "-" + i,
    sku: skuH ? String(row[skuH.original] || "").trim() : "",
    modelo: modelH ? String(row[modelH.original] || "").trim() : "",
    precioAnterior: prevH ? (parseFloat(row[prevH.original]) || 0) : 0,
    precioNuevo: newH ? (parseFloat(row[newH.original]) || 0) : 0,
    color: colorH ? String(row[colorH.original] || "").trim() : "",
    seccion: tallaH ? String(row[tallaH.original] || "").trim() : "",
    cantidad: cantH ? (parseInt(row[cantH.original]) || 0) : 0,
    tipoEtiqueta: tipoH ? String(row[tipoH.original] || "").trim() : "",
    status: STATUS.PENDING,
    auditNote: "",
  })).filter(it => it.modelo || it.sku);
}

function getSections(items) {
  const map = {};
  items.forEach(it => { const key = it.seccion || "Sin sección"; if (!map[key]) map[key] = []; map[key].push(it); });
  return Object.entries(map).map(([name, items]) => ({ name, items }));
}

function getBatchStatus(batch) {
  const sections = getSections(batch.items);
  const allDelivered = sections.every(s => batch.sectionDeliveries?.[s.name]);
  const allVerified = batch.items.every(it => it.status === STATUS.VERIFIED);
  const allAudited = batch.items.every(it => it.status === STATUS.VERIFIED || it.status === STATUS.REJECTED);
  if (allVerified) return STATUS.VERIFIED;
  if (allAudited && batch.items.some(it => it.status === STATUS.REJECTED)) return STATUS.REJECTED;
  if (allDelivered) return STATUS.DELIVERED;
  if (sections.some(s => batch.sectionDeliveries?.[s.name])) return STATUS.DELIVERED;
  return STATUS.PENDING;
}

// Download batch as XLSX - uses data already in memory, 0 Firebase reads
function downloadBatchXLSX(batch) {
  const rows = batch.items.map(it => ({
    "SKU": it.sku,
    "MODELO": it.modelo,
    "Precio Anterior": it.precioAnterior,
    "Precio Actual": it.precioNuevo,
    "Sección": it.seccion,
    "Cantidad": it.cantidad,
    "Tipo Etiqueta": it.tipoEtiqueta,
    "Estado": it.status,
    "Nota Auditoría": it.auditNote || "",
    "Entregado a": batch.sectionDeliveries?.[(it.seccion || "Sin sección")]?.receiverName || "",
    "Fecha Entrega": batch.sectionDeliveries?.[(it.seccion || "Sin sección")]?.deliveredAt || "",
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Productos");
  XLSX.writeFile(wb, `${batch.archivo.replace(/\.[^.]+$/, "")}_reporte.xlsx`);
}

export default function App() {
  const [tab, setTab] = useState("cargar");
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dragOver, setDragOver] = useState(false);
  const [uploadMsg, setUploadMsg] = useState(null);
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [selectedSection, setSelectedSection] = useState(null);
  const [filterStatus, setFilterStatus] = useState("todos");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterTag, setFilterTag] = useState("todos");
  const [deliveryModal, setDeliveryModal] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(null);

  useEffect(() => {
    loadBatches((p) => setUploadProgress(p)).then(data => {
      setBatches(data);
      setLoading(false);
      setUploadProgress(null);
    });
  }, []);

  const persistBatch = useCallback(async (batch) => {
    await saveBatch(batch);
  }, []);

  const handleFile = (file) => {
    if (!file) return;
    const ext = file.name.split(".").pop().toLowerCase();
    const reader = new FileReader();
    reader.onload = async (e) => {
      let items = [];
      setUploadProgress({ step: 0, total: 1, message: "Leyendo archivo..." });
      try {
        if (["xlsx", "xls", "xlsm"].includes(ext)) {
          const wb = XLSX.read(new Uint8Array(e.target.result), { type: "array" });
          items = parseFileData(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" }));
        } else {
          items = parseFileData(Papa.parse(e.target.result, { header: true, skipEmptyLines: true, dynamicTyping: true }).data);
        }
      } catch (err) { setUploadProgress(null); setUploadMsg({ type: "error", text: "Error: " + err.message }); return; }
      if (items.length === 0) { setUploadProgress(null); setUploadMsg({ type: "error", text: "No se encontraron productos válidos." }); return; }
      setUploadProgress({ step: 0, total: 1, message: `${items.length.toLocaleString()} productos encontrados. Subiendo a base de datos...` });
      const sections = getSections(items);
      const batch = {
        id: Date.now().toString(), createdAt: Date.now(),
        fecha: new Date().toLocaleDateString("es-MX", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }),
        archivo: file.name, items,
        totalPiezas: items.reduce((s, it) => s + it.cantidad, 0),
        sectionDeliveries: {}, status: STATUS.PENDING,
      };
      try {
        await saveBatch(batch, (p) => setUploadProgress(p));
        setBatches(prev => [batch, ...prev]);
        setUploadProgress(null);
        setUploadMsg({ type: "ok", text: `✅ ${items.length.toLocaleString()} productos en ${sections.length} sección(es) cargados.` });
        setTimeout(() => setUploadMsg(null), 5000);
      } catch (err) {
        setUploadProgress(null);
        setUploadMsg({ type: "error", text: "Error al guardar: " + err.message });
      }
    };
    ["xlsx", "xls", "xlsm"].includes(ext) ? reader.readAsArrayBuffer(file) : reader.readAsText(file);
  };

  const confirmSectionDelivery = async (batchId, sectionName, deliveryData) => {
    setBatches(prev => {
      const next = prev.map(b => {
        if (b.id !== batchId) return b;
        const sd = { ...b.sectionDeliveries, [sectionName]: deliveryData };
        const changedItems = [];
        const newItems = b.items.map(it => {
          if ((it.seccion || "Sin sección") === sectionName) {
            const updated = { ...it, status: STATUS.DELIVERED };
            changedItems.push(updated);
            return updated;
          }
          return it;
        });
        const nb = { ...b, sectionDeliveries: sd, items: newItems };
        nb.status = getBatchStatus(nb);
        updateBatchItems(nb, changedItems);
        if (selectedBatch?.id === batchId) setSelectedBatch(nb);
        return nb;
      });
      return next;
    });
    setDeliveryModal(null);
  };

  const updateItemStatus = (batchId, itemId, newStatus, note) => {
    setBatches(prev => prev.map(b => {
      if (b.id !== batchId) return b;
      const updatedItem = b.items.find(it => it.id === itemId);
      if (!updatedItem) return b;
      const newItem = { ...updatedItem, status: newStatus, auditNote: note !== undefined ? note : updatedItem.auditNote };
      const items = b.items.map(it => it.id === itemId ? newItem : it);
      const nb = { ...b, items }; nb.status = getBatchStatus(nb);
      updateBatchItem(batchId, newItem);
      updateBatchMeta(nb);
      if (selectedBatch?.id === batchId) setSelectedBatch(nb);
      return nb;
    }));
  };

  const markSectionVerified = (batchId, sectionName) => {
    setBatches(prev => prev.map(b => {
      if (b.id !== batchId) return b;
      const changedItems = [];
      const items = b.items.map(it => {
        if ((it.seccion || "Sin sección") === sectionName) {
          const updated = { ...it, status: STATUS.VERIFIED };
          changedItems.push(updated);
          return updated;
        }
        return it;
      });
      const nb = { ...b, items }; nb.status = getBatchStatus(nb);
      updateBatchItems(nb, changedItems);
      if (selectedBatch?.id === batchId) setSelectedBatch(nb);
      return nb;
    }));
  };

  const DELETE_PASSWORD = "Operaciones78";

  const askDeletePassword = () => {
    const input = prompt("🔒 Escribe la contraseña para eliminar:");
    return input === DELETE_PASSWORD;
  };

  const handleDeleteBatch = async (batchId) => {
    if (!askDeletePassword()) { alert("❌ Contraseña incorrecta"); return; }
    await deleteBatchFromDB(batchId);
    setBatches(prev => prev.filter(b => b.id !== batchId));
    if (selectedBatch?.id === batchId) { setSelectedBatch(null); setSelectedSection(null); }
  };

  const handleDeleteAll = async () => {
    if (!askDeletePassword()) { alert("❌ Contraseña incorrecta"); return; }
    if (!confirm("⚠️ ¿Estás seguro de eliminar TODO el historial?")) return;
    await deleteAllBatches();
    setBatches([]);
  };

  const stats = {
    pendientes: batches.filter(b => b.status === STATUS.PENDING).length,
    entregados: batches.filter(b => b.status === STATUS.DELIVERED).length,
    verificados: batches.filter(b => b.status === STATUS.VERIFIED).length,
    totalProductos: batches.reduce((s, b) => s + b.items.length, 0),
  };

  const goBack = () => { if (selectedSection) setSelectedSection(null); else { setSelectedBatch(null); setSelectedSection(null); } setSearchTerm(""); setFilterTag("todos"); };

  if (loading) return (
    <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", height: "100vh", fontFamily: "'Inter', system-ui, sans-serif", color: "#64748B", gap: 10, padding: 20 }}>
      <div style={{ width: 32, height: 32, border: "3px solid #E2E8F0", borderTopColor: "#3B82F6", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
      <p style={{ fontSize: 14, fontWeight: 600 }}>{uploadProgress?.message || "Cargando datos..."}</p>
      {uploadProgress && (
        <div style={{ width: "80%", maxWidth: 300 }}>
          <div style={{ height: 6, background: "#E2E8F0", borderRadius: 3, overflow: "hidden" }}>
            <div style={{ height: "100%", background: "#3B82F6", borderRadius: 3, width: `${uploadProgress.total ? Math.round((uploadProgress.step / uploadProgress.total) * 100) : 0}%`, transition: "width .3s" }} />
          </div>
          <p style={{ textAlign: "center", fontSize: 11, color: "#94A3B8", marginTop: 4 }}>{uploadProgress.step}/{uploadProgress.total}</p>
        </div>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  const renderSectionCard = (section, batch, clickable, showDeliveryBtn) => {
    const del = batch.sectionDeliveries?.[section.name];
    const pzas = section.items.reduce((s, i) => s + i.cantidad, 0);
    const verified = section.items.filter(i => i.status === STATUS.VERIFIED).length;
    const rejected = section.items.filter(i => i.status === STATUS.REJECTED).length;
    const sectionStatus = del ? (section.items.every(i => i.status === STATUS.VERIFIED) ? STATUS.VERIFIED : section.items.every(i => i.status === STATUS.VERIFIED || i.status === STATUS.REJECTED) && rejected > 0 ? STATUS.REJECTED : STATUS.DELIVERED) : STATUS.PENDING;
    return (
      <div key={section.name} onClick={clickable ? () => setSelectedSection(section.name) : undefined}
        style={{ background: "#fff", borderRadius: 10, padding: "12px 14px", marginBottom: 8, boxShadow: "0 1px 3px rgba(0,0,0,.05)", cursor: clickable ? "pointer" : "default", borderLeft: `4px solid ${STATUS_COLORS[sectionStatus].dot}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
          <div>
            <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>📍 {section.name}</h4>
            <p style={{ margin: "2px 0 0", fontSize: 11, color: "#64748B" }}>{section.items.length} productos · {pzas} pzas</p>
            {del && <p style={{ margin: "2px 0 0", fontSize: 11, color: "#10B981" }}>📝 {del.receiverName} — {del.deliveredAt}</p>}
          </div>
          <StatusBadge status={sectionStatus} />
        </div>
        {del && <div style={{ marginTop: 6, display: "flex", gap: 8, fontSize: 11, color: "#64748B" }}><span>✅{verified}</span><span>❌{rejected}</span><span>⏳{section.items.length - verified - rejected}</span></div>}
        {showDeliveryBtn && !del && (
          <button onClick={(e) => { e.stopPropagation(); setDeliveryModal({ batchId: batch.id, section }); }}
            style={{ marginTop: 8, padding: "8px 14px", background: "#3B82F6", color: "#fff", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", width: "100%" }}>
            📦 Entregar esta sección
          </button>
        )}
      </div>
    );
  };

  const renderItemsList = (items, batchId, showAudit) => {
    return items.filter(it => {
      const ms = !searchTerm || it.modelo.toLowerCase().includes(searchTerm.toLowerCase()) || it.sku.includes(searchTerm);
      const mt = filterTag === "todos" || it.tipoEtiqueta === filterTag;
      return ms && mt;
    }).map(item => (
      <div key={item.id} style={{ background: "#fff", borderRadius: 8, padding: "10px 12px", marginBottom: 5, boxShadow: "0 1px 2px rgba(0,0,0,.04)", borderLeft: showAudit ? `3px solid ${item.status === STATUS.VERIFIED ? "#10B981" : item.status === STATUS.REJECTED ? "#EF4444" : "#E2E8F0"}` : "none" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 6 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <span style={{ fontSize: 10, color: "#94A3B8", fontFamily: "monospace" }}>{item.sku}</span>
              <TagBadge tipo={item.tipoEtiqueta} />
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>{item.modelo}</div>
            <div style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>
              {item.precioAnterior > 0 && <><span style={{ textDecoration: "line-through", color: "#94A3B8" }}>${item.precioAnterior.toLocaleString()}</span> → </>}
              <span style={{ color: "#10B981", fontWeight: 700 }}>${item.precioNuevo.toLocaleString()}</span>
              {item.cantidad > 0 && <span style={{ color: "#94A3B8", marginLeft: 8, fontSize: 11 }}>×{item.cantidad}</span>}
            </div>
          </div>
          <StatusBadge status={item.status} />
        </div>
        {showAudit && item.status !== STATUS.PENDING && (
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <button onClick={() => updateItemStatus(batchId, item.id, STATUS.VERIFIED)}
              style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid #10B981", background: item.status === STATUS.VERIFIED ? "#10B981" : "#fff", color: item.status === STATUS.VERIFIED ? "#fff" : "#10B981", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>✅ Aplicado</button>
            <button onClick={() => updateItemStatus(batchId, item.id, STATUS.REJECTED)}
              style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid #EF4444", background: item.status === STATUS.REJECTED ? "#EF4444" : "#fff", color: item.status === STATUS.REJECTED ? "#fff" : "#EF4444", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>❌ No aplicado</button>
          </div>
        )}
        {showAudit && item.status === STATUS.REJECTED && (
          <input placeholder="Nota: ej. precio incorrecto..." value={item.auditNote || ""} onChange={e => updateItemStatus(batchId, item.id, STATUS.REJECTED, e.target.value)}
            style={{ marginTop: 6, width: "100%", padding: "7px 10px", borderRadius: 6, border: "1px solid #FECACA", fontSize: 11, boxSizing: "border-box", outline: "none", background: "#FFF5F5" }} />
        )}
      </div>
    ));
  };

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", background: "#F8FAFC", minHeight: "100vh", color: "#1E293B" }}>
      {deliveryModal && <SectionDeliveryModal section={deliveryModal.section} batchId={deliveryModal.batchId} onConfirm={(d) => confirmSectionDelivery(deliveryModal.batchId, deliveryModal.section.name, d)} onCancel={() => setDeliveryModal(null)} />}

      <div style={{ background: "linear-gradient(135deg, #0F172A 0%, #1E293B 100%)", padding: "18px 20px 12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 20 }}>🏷️</span>
          <h1 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#F8FAFC" }}>Control de Etiquetas y Precios</h1>
        </div>
        <p style={{ margin: "2px 0 0", fontSize: 11, color: "#64748B" }}>Entrega por sección con firma · Auditoría en piso</p>
      </div>

      <div style={{ display: "flex", background: "#fff", borderBottom: "1px solid #E2E8F0", overflowX: "auto", position: "sticky", top: 0, zIndex: 10 }}>
        {TABS.map(t => (
          <button key={t} onClick={() => { setTab(t); setSelectedBatch(null); setSelectedSection(null); setSearchTerm(""); setFilterTag("todos"); }} style={{
            flex: 1, padding: "11px 6px", border: "none", background: "none", cursor: "pointer",
            fontSize: 12, fontWeight: tab === t ? 700 : 500, color: tab === t ? "#1E293B" : "#94A3B8",
            borderBottom: tab === t ? "2px solid #3B82F6" : "2px solid transparent", whiteSpace: "nowrap",
          }}>{t === "cargar" ? "📤 Cargar" : t === "seguimiento" ? "📊 Seguimiento" : t === "auditoría" ? "🔍 Auditoría" : "📁 Historial"}</button>
        ))}
      </div>

      <div style={{ padding: "14px", maxWidth: 800, margin: "0 auto" }}>
        {tab === "cargar" && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8, marginBottom: 16 }}>
              {[["Pendientes", stats.pendientes, "#F59E0B"], ["Entregados", stats.entregados, "#3B82F6"], ["Verificados", stats.verificados, "#10B981"], ["Productos", stats.totalProductos, "#8B5CF6"]].map(([l, v, c]) => (
                <div key={l} style={{ background: "#fff", borderRadius: 10, padding: "12px 14px", boxShadow: "0 1px 3px rgba(0,0,0,.05)", borderLeft: `3px solid ${c}` }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: c }}>{v}</div>
                  <div style={{ fontSize: 10, color: "#64748B", fontWeight: 500 }}>{l}</div>
                </div>
              ))}
            </div>
            <div onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); }}
              onClick={() => document.getElementById("fileInput").click()}
              style={{ border: `2px dashed ${dragOver ? "#3B82F6" : "#CBD5E1"}`, borderRadius: 12, padding: "30px 16px", textAlign: "center", background: dragOver ? "#EFF6FF" : "#fff", cursor: "pointer" }}>
              <div style={{ fontSize: 36, marginBottom: 6 }}>📁</div>
              <p style={{ margin: 0, fontWeight: 600, fontSize: 14, color: "#334155" }}>Arrastra tu archivo aquí</p>
              <p style={{ margin: "4px 0 0", fontSize: 12, color: "#94A3B8" }}>XLSX, CSV o TXT</p>
              <input id="fileInput" type="file" accept=".csv,.txt,.tsv,.xlsx,.xls,.xlsm" style={{ display: "none" }} onChange={(e) => { handleFile(e.target.files[0]); e.target.value = ""; }} />
            </div>
            {uploadProgress && !loading && (
              <div style={{ marginTop: 12, padding: "14px", background: "#fff", borderRadius: 10, boxShadow: "0 1px 3px rgba(0,0,0,.05)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <div style={{ width: 20, height: 20, border: "2.5px solid #E2E8F0", borderTopColor: "#3B82F6", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#1E293B" }}>{uploadProgress.message}</p>
                </div>
                <div style={{ height: 8, background: "#E2E8F0", borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ height: "100%", background: "linear-gradient(90deg, #3B82F6, #10B981)", borderRadius: 4, width: `${uploadProgress.total ? Math.round((uploadProgress.step / uploadProgress.total) * 100) : 5}%`, transition: "width .5s ease" }} />
                </div>
                <p style={{ margin: "6px 0 0", fontSize: 11, color: "#94A3B8", textAlign: "center" }}>
                  {uploadProgress.total ? `${Math.round((uploadProgress.step / uploadProgress.total) * 100)}%` : "Procesando..."}
                </p>
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
              </div>
            )}
            {uploadMsg && <div style={{ marginTop: 10, padding: "10px 14px", borderRadius: 8, fontSize: 13, fontWeight: 500, background: uploadMsg.type === "ok" ? "#D1FAE5" : "#FEE2E2", color: uploadMsg.type === "ok" ? "#065F46" : "#991B1B" }}>{uploadMsg.text}</div>}
          </div>
        )}

        {tab === "seguimiento" && (
          <div>
            {batches.length === 0 ? <div style={{ textAlign: "center", padding: 40, color: "#94A3B8" }}><div style={{ fontSize: 36 }}>📭</div><p>No hay lotes</p></div>
            : selectedBatch ? (
              selectedSection ? (
                <div>
                  <button onClick={goBack} style={{ background: "none", border: "none", cursor: "pointer", color: "#3B82F6", fontSize: 13, fontWeight: 600, padding: 0, marginBottom: 10 }}>← Secciones</button>
                  <div style={{ background: "#EFF6FF", borderRadius: 8, padding: "10px 14px", marginBottom: 10 }}>
                    <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#1E40AF" }}>📍 {selectedSection}</h3>
                  </div>
                  {selectedBatch.sectionDeliveries?.[selectedSection] && <SectionReceipt delivery={selectedBatch.sectionDeliveries[selectedSection]} />}
                  {renderItemsList(selectedBatch.items.filter(i => (i.seccion || "Sin sección") === selectedSection), selectedBatch.id, false)}
                </div>
              ) : (
                <div>
                  <button onClick={goBack} style={{ background: "none", border: "none", cursor: "pointer", color: "#3B82F6", fontSize: 13, fontWeight: 600, padding: 0, marginBottom: 10 }}>← Lotes</button>
                  <div style={{ background: "#fff", borderRadius: 10, padding: 14, boxShadow: "0 1px 3px rgba(0,0,0,.05)", marginBottom: 12 }}>
                    <h3 style={{ margin: 0, fontSize: 14 }}>{selectedBatch.archivo}</h3>
                    <p style={{ margin: "2px 0", fontSize: 11, color: "#94A3B8" }}>{selectedBatch.fecha}</p>
                    {(() => { const secs = getSections(selectedBatch.items); const del = secs.filter(s => selectedBatch.sectionDeliveries?.[s.name]).length; return <p style={{ margin: "4px 0 0", fontSize: 12, fontWeight: 600, color: del === secs.length ? "#10B981" : "#F59E0B" }}>{del}/{secs.length} secciones entregadas</p>; })()}
                    <button onClick={() => downloadBatchXLSX(selectedBatch)} style={{ marginTop: 8, padding: "7px 14px", background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 8, fontSize: 12, fontWeight: 600, color: "#1E40AF", cursor: "pointer", width: "100%" }}>📥 Descargar reporte XLSX</button>
                  </div>
                  {getSections(selectedBatch.items).map(s => renderSectionCard(s, selectedBatch, true, true))}
                </div>
              )
            ) : (
              <div>
                <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
                  {["todos", STATUS.PENDING, STATUS.DELIVERED, STATUS.VERIFIED].map(s => (
                    <button key={s} onClick={() => setFilterStatus(s)} style={{ padding: "5px 12px", borderRadius: 20, border: "1px solid", fontSize: 11, fontWeight: 600, cursor: "pointer", background: filterStatus === s ? "#1E293B" : "#fff", color: filterStatus === s ? "#fff" : "#64748B", borderColor: filterStatus === s ? "#1E293B" : "#E2E8F0" }}>
                      {s === "todos" ? "Todos" : s.charAt(0).toUpperCase() + s.slice(1)}</button>
                  ))}
                </div>
                {batches.filter(b => filterStatus === "todos" || b.status === filterStatus).map(b => {
                  const secs = getSections(b.items); const del = secs.filter(s => b.sectionDeliveries?.[s.name]).length;
                  return (
                    <div key={b.id} onClick={() => setSelectedBatch(b)} style={{ background: "#fff", borderRadius: 10, padding: "12px 14px", marginBottom: 8, boxShadow: "0 1px 3px rgba(0,0,0,.05)", cursor: "pointer" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
                        <div>
                          <h4 style={{ margin: 0, fontSize: 13 }}>{b.archivo}</h4>
                          <p style={{ margin: "2px 0", fontSize: 11, color: "#94A3B8" }}>{b.fecha}</p>
                          <p style={{ margin: 0, fontSize: 11, color: del === secs.length ? "#10B981" : "#F59E0B", fontWeight: 600 }}>📦 {del}/{secs.length} secciones</p>
                        </div>
                        <StatusBadge status={b.status} />
                      </div>
                      <div style={{ marginTop: 8, height: 4, background: "#E2E8F0", borderRadius: 4, overflow: "hidden" }}>
                        <div style={{ height: "100%", borderRadius: 4, background: "#3B82F6", width: `${secs.length ? Math.round((del / secs.length) * 100) : 0}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {tab === "auditoría" && (
          <div>
            {batches.filter(b => b.status !== STATUS.PENDING).length === 0 ? <div style={{ textAlign: "center", padding: 40, color: "#94A3B8" }}><div style={{ fontSize: 36 }}>🔍</div><p>No hay lotes para auditar</p></div>
            : selectedBatch ? (
              selectedSection ? (
                <div>
                  <button onClick={goBack} style={{ background: "none", border: "none", cursor: "pointer", color: "#3B82F6", fontSize: 13, fontWeight: 600, padding: 0, marginBottom: 10 }}>← Secciones</button>
                  <div style={{ background: "#EFF6FF", borderRadius: 8, padding: "10px 14px", marginBottom: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#1E40AF" }}>📍 {selectedSection}</h3>
                      <button onClick={() => markSectionVerified(selectedBatch.id, selectedSection)} style={{ padding: "5px 10px", background: "#10B981", color: "#fff", border: "none", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>✅ Verificar toda</button>
                    </div>
                  </div>
                  {selectedBatch.sectionDeliveries?.[selectedSection] && <SectionReceipt delivery={selectedBatch.sectionDeliveries[selectedSection]} />}
                  <input placeholder="Buscar SKU o producto..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid #E2E8F0", fontSize: 12, marginBottom: 8, boxSizing: "border-box", outline: "none" }} />
                  {renderItemsList(selectedBatch.items.filter(i => (i.seccion || "Sin sección") === selectedSection), selectedBatch.id, true)}
                </div>
              ) : (
                <div>
                  <button onClick={goBack} style={{ background: "none", border: "none", cursor: "pointer", color: "#3B82F6", fontSize: 13, fontWeight: 600, padding: 0, marginBottom: 10 }}>← Lotes</button>
                  <div style={{ background: "#fff", borderRadius: 10, padding: 14, boxShadow: "0 1px 3px rgba(0,0,0,.05)", marginBottom: 12 }}>
                    <h3 style={{ margin: 0, fontSize: 14 }}>{selectedBatch.archivo}</h3>
                    <p style={{ margin: "2px 0 0", fontSize: 11, color: "#94A3B8" }}>{selectedBatch.fecha}</p>
                  </div>
                  {getSections(selectedBatch.items).filter(s => selectedBatch.sectionDeliveries?.[s.name]).map(s => renderSectionCard(s, selectedBatch, true, false))}
                </div>
              )
            ) : (
              batches.filter(b => b.status !== STATUS.PENDING).map(b => {
                const verified = b.items.filter(i => i.status === STATUS.VERIFIED).length;
                const pct = b.items.length ? Math.round((verified / b.items.length) * 100) : 0;
                return (
                  <div key={b.id} onClick={() => setSelectedBatch(b)} style={{ background: "#fff", borderRadius: 10, padding: "12px 14px", marginBottom: 8, boxShadow: "0 1px 3px rgba(0,0,0,.05)", cursor: "pointer" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div><h4 style={{ margin: 0, fontSize: 13 }}>{b.archivo}</h4><p style={{ margin: "2px 0", fontSize: 11, color: "#94A3B8" }}>{b.fecha}</p></div>
                      <span style={{ fontSize: 14, fontWeight: 700, color: pct === 100 ? "#10B981" : "#64748B" }}>{pct}%</span>
                    </div>
                    <div style={{ marginTop: 6, height: 4, background: "#E2E8F0", borderRadius: 4, overflow: "hidden" }}><div style={{ height: "100%", borderRadius: 4, background: "#10B981", width: `${pct}%` }} /></div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {tab === "historial" && (
          <div>
            {batches.length === 0 ? <div style={{ textAlign: "center", padding: 40, color: "#94A3B8" }}><div style={{ fontSize: 36 }}>📁</div><p>Sin historial</p></div>
            : <>
              <p style={{ fontSize: 12, color: "#64748B", marginTop: 0 }}>{batches.length} lotes</p>
              {batches.map(b => {
                const sections = getSections(b.items);
                return (
                  <div key={b.id} style={{ background: "#fff", borderRadius: 10, padding: "12px 14px", marginBottom: 8, boxShadow: "0 1px 3px rgba(0,0,0,.05)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <h4 style={{ margin: 0, fontSize: 13 }}>{b.archivo}</h4>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <button onClick={(e) => { e.stopPropagation(); downloadBatchXLSX(b); }} style={{ background: "#EFF6FF", border: "1px solid #BFDBFE", cursor: "pointer", fontSize: 11, color: "#1E40AF", padding: "3px 8px", borderRadius: 4, fontWeight: 600 }} title="Descargar">📥 XLSX</button>
                        <StatusBadge status={b.status} />
                        <button onClick={() => { handleDeleteBatch(b.id); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "#CBD5E1", padding: 2 }}>🗑️</button>
                      </div>
                    </div>
                    <p style={{ margin: "2px 0 6px", fontSize: 11, color: "#94A3B8" }}>{b.fecha} · {b.items.length} prod</p>
                    {sections.map(s => {
                      const del = b.sectionDeliveries?.[s.name];
                      return del ? (
                        <div key={s.name} style={{ marginBottom: 4, padding: "6px 10px", background: "#F0FDF4", borderRadius: 6, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          {del.signature && <img src={del.signature} alt="Firma" style={{ height: 28, borderRadius: 4, border: "1px solid #BBF7D0" }} />}
                          <div>
                            <p style={{ margin: 0, fontSize: 11, fontWeight: 600, color: "#065F46" }}>📍 {s.name} → {del.receiverName}</p>
                            <p style={{ margin: 0, fontSize: 10, color: "#64748B" }}>{del.deliveredAt} · ✅{s.items.filter(i => i.status === STATUS.VERIFIED).length}/{s.items.length}</p>
                          </div>
                        </div>
                      ) : <p key={s.name} style={{ margin: "2px 0", fontSize: 11, color: "#F59E0B" }}>📍 {s.name} — pendiente</p>;
                    })}
                  </div>
                );
              })}
              <button onClick={() => { handleDeleteAll(); }}
                style={{ marginTop: 10, padding: 10, background: "#FEE2E2", color: "#991B1B", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", width: "100%" }}>🗑️ Limpiar historial</button>
            </>}
          </div>
        )}
      </div>
    </div>
  );
}
