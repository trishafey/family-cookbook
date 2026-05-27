// Shopping-list modal — supports multiple recipes, check-off, copy/print/export.

import { useState, useMemo } from "react";
import { useStorage, buildShoppingList, formatQty, Icon } from "./helpers.jsx";
import { Modal } from "./ui.jsx";

export function ShoppingList({ open, onClose, payload }) {
  // payload: [{ recipe, ings }]
  const [have, setHave] = useStorage("shop:have", {});

  const buckets = useMemo(() => {
    if (!payload || !payload.length) return {};
    return buildShoppingList(payload.map(p => p.ings));
  }, [payload]);

  const allItems = Object.values(buckets).flat();
  const haveCount = allItems.filter(i => have[`${i.item}|${i.unit}`]).length;
  const needCount = allItems.length - haveCount;

  const toggleHave = (i) => {
    const k = `${i.item}|${i.unit}`;
    setHave(h => ({ ...h, [k]: !h[k] }));
  };

  const buildTextList = (onlyNeeded) => {
    const out = [];
    out.push(`SHOPPING LIST — ${payload.map(p => p.recipe.title).join(", ")}`);
    out.push("");
    for (const [grp, items] of Object.entries(buckets)) {
      const filtered = items.filter(i => !onlyNeeded || !have[`${i.item}|${i.unit}`]);
      if (!filtered.length) continue;
      out.push(`${grp.toUpperCase()}`);
      for (const i of filtered) {
        out.push(`  ☐ ${formatQty(i.qty)} ${i.unit} ${i.item}`);
      }
      out.push("");
    }
    return out.join("\n");
  };

  const copyList = () => {
    navigator.clipboard.writeText(buildTextList(true));
    alert("Copied the still-needed items to your clipboard.");
  };
  const downloadList = () => {
    const txt = buildTextList(true);
    const blob = new Blob([txt], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "shopping-list.txt"; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Shopping list"
      subtitle={
        payload?.length
          ? `${payload.map(p => p.recipe.title).join(" + ")} · ${needCount} to buy, ${haveCount} on hand`
          : ""
      }
      size="lg"
      footer={
        <>
          <span style={{ fontSize: 12, color: "var(--ink-3)" }}>
            Tap to mark what's already in your pantry.
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn ghost sm" onClick={copyList}><Icon name="copy" size={13} /> Copy needed</button>
            <button className="btn ghost sm" onClick={downloadList}><Icon name="download" size={13} /> Download</button>
            <button className="btn sm" onClick={() => window.print()}><Icon name="print" size={13} /> Print</button>
            <button className="btn primary sm" onClick={onClose}>Done</button>
          </div>
        </>
      }
    >
      <div className="shop-list">
        {Object.entries(buckets).map(([grp, items]) => (
          <div className="group" key={grp}>
            <div className="group-label">{grp}</div>
            <ul style={{ padding: 0, margin: 0 }}>
              {items.map((i, idx) => {
                const k = `${i.item}|${i.unit}`;
                const isHave = !!have[k];
                return (
                  <li key={k} className={isHave ? "have" : ""} onClick={() => toggleHave(i)}>
                    <div className="check">
                      {isHave && <Icon name="check" size={13} />}
                    </div>
                    <div className="item">{i.item}</div>
                    <div className="qty">{formatQty(i.qty)} {i.unit}</div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        {Object.keys(buckets).length === 0 && (
          <div style={{ padding: 40, textAlign: "center", color: "var(--ink-3)" }}>
            Nothing to shop for yet. Open a recipe and tap "Shopping list."
          </div>
        )}
      </div>
    </Modal>
  );
}

