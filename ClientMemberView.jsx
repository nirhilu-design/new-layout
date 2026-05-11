import { useMemo, useState } from "react";

function ClientMemberView({ member }) {
  const [productFilter, setProductFilter] = useState("all");
  const [filterOpen, setFilterOpen] = useState(false);

  const formatCurrency = (value) =>
    `₪${Math.round(Number(value || 0)).toLocaleString("en-US")}`;

  const formatPercent = (value) => `${Math.round(Number(value || 0))}%`;

  if (!member) {
    return <div style={{ direction: "rtl" }}>לא נמצא בן משפחה</div>;
  }

  const summary = member.summary || {};
  const insurance = member.insurance || {};
  const exposures = member.exposures || {};
  const products = member.products || [];
  const managers = member.managers || [];

  const productDistribution = products.map((p) => ({
    id: p.id,
    name: p.planName,
    value: p.currentValue,
  }));

  const filterOptions = useMemo(() => {
    const options = [{ id: "all", label: "כל המוצרים" }];
    const productTypes = new Set();

    products.forEach((product) => {
      if (product.productType) {
        productTypes.add(product.productType);
      }
    });

    Array.from(productTypes).forEach((name) => {
      options.push({
        id: `productType:${name}`,
        label: name,
      });
    });

    return options;
  }, [products]);

  const selectedFilterLabel =
    filterOptions.find((option) => option.id === productFilter)?.label ||
    "כל המוצרים";

  const filteredProducts = useMemo(() => {
    if (productFilter === "all") return products;

    const [type, value] = productFilter.split(":");

    if (type === "productType") {
      return products.filter((product) => product.productType === value);
    }

    return products;
  }, [products, productFilter]);

  const handleFilterSelect = (id) => {
    setProductFilter(id);
    setFilterOpen(false);
  };

  return (
    <div className="client-member-root" style={page}>
      <style>
        {`
          @media print {
            @page {
              size: A4 portrait;
              margin: 6mm;
            }

            html,
            body {
              width: 210mm !important;
              min-height: 297mm !important;
              margin: 0 !important;
              padding: 0 !important;
              background: #ffffff !important;
              direction: rtl !important;
              overflow: visible !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }

            body {
              zoom: 1 !important;
            }

            .client-member-root {
              width: 198mm !important;
              max-width: 198mm !important;
              margin: 0 auto !important;
              padding: 0 !important;
              background: #ffffff !important;
              direction: rtl !important;
              overflow: visible !important;
              box-sizing: border-box !important;
            }

            .client-member-root,
            .client-member-root * {
              box-sizing: border-box !important;
            }

            .member-hero {
              margin-bottom: 7px !important;
              padding: 10px 12px !important;
              border-radius: 13px !important;
              box-shadow: none !important;
              break-inside: avoid !important;
              page-break-inside: avoid !important;
            }

            .member-top-grid,
            .member-lower-grid,
            .member-compare-grid {
              display: grid !important;
              grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
              gap: 7px !important;
              margin-bottom: 7px !important;
              align-items: stretch !important;
            }

            .member-section-card,
            .member-kpi-card,
            .member-donut-card {
              width: auto !important;
              max-width: 100% !important;
              box-shadow: none !important;
              border-radius: 12px !important;
              box-sizing: border-box !important;
              break-inside: avoid !important;
              page-break-inside: avoid !important;
              overflow: hidden !important;
            }

            .member-section-card {
              padding: 8px !important;
              margin-bottom: 7px !important;
            }

            .member-kpi-card {
              min-height: 78px !important;
              height: auto !important;
              padding: 7px !important;
            }

            .member-donut-card {
              min-height: auto !important;
              height: auto !important;
              padding: 0 !important;
            }

            .member-donut-layout {
              display: grid !important;
              grid-template-columns: 95px minmax(0, 1fr) !important;
              gap: 7px !important;
              margin-top: 5px !important;
              align-items: center !important;
            }

            .member-donut-chart svg {
              width: 92px !important;
              height: 92px !important;
              max-width: 92px !important;
              max-height: 92px !important;
            }

            .member-products-header {
              margin-bottom: 7px !important;
            }

            .member-filter-print-hide,
            .member-filter-print-hide * {
              display: none !important;
            }

            .member-table-wrap {
              width: 100% !important;
              max-width: 100% !important;
              overflow: visible !important;
              border-radius: 10px !important;
              break-inside: auto !important;
              page-break-inside: auto !important;
            }

            .member-products-table {
              width: 100% !important;
              min-width: 100% !important;
              max-width: 100% !important;
              table-layout: fixed !important;
              border-collapse: collapse !important;
              break-inside: auto !important;
              page-break-inside: auto !important;
            }

            .member-products-table thead,
            .member-products-table tbody,
            .member-products-table tr {
              break-inside: avoid !important;
              page-break-inside: avoid !important;
            }

            .member-products-table th,
            .member-products-table td {
              font-size: 7px !important;
              line-height: 1.2 !important;
              padding: 4px 3px !important;
              white-space: normal !important;
              word-break: break-word !important;
              overflow-wrap: anywhere !important;
            }

            h1 {
              font-size: 17px !important;
              line-height: 1.1 !important;
            }

            h2,
            h3 {
              font-size: 10px !important;
              line-height: 1.2 !important;
            }

            p,
            span,
            div {
              font-size: 8.5px !important;
            }

            .member-kpi-value {
              font-size: 18px !important;
              line-height: 1 !important;
              margin-bottom: 2px !important;
            }

            .member-exposure-value {
              font-size: 18px !important;
              line-height: 1 !important;
            }

            .member-explanation {
              margin-bottom: 5px !important;
              line-height: 1.3 !important;
            }

            .member-kpi-card svg {
              width: 18px !important;
              height: 18px !important;
            }

            .member-kpi-card > div:first-child {
              width: 32px !important;
              height: 32px !important;
              border-radius: 10px !important;
              margin-bottom: 3px !important;
            }
          }
        `}
      </style>

      <Header
        title={member.name}
        eyebrow="מסך לקוח · מבט אישי"
        subtitle="תצוגה אישית מתוך הדוח הפנסיוני המשפחתי המאוחד."
      />

      <section className="member-top-grid" style={topGrid}>
        <KpiCard
          icon={<AssetsIcon />}
          title="סך נכסים"
          value={formatCurrency(summary.totalAssets)}
          subtext="סך הצבירה האישית"
        />

        <KpiCard
          icon={<DepositIcon />}
          title="הפקדה חודשית"
          value={formatCurrency(summary.monthlyDeposits)}
          subtext="סך ההפקדות החודשיות"
        />

        <KpiCard
          icon={<SavingsIcon />}
          title="צבירה צפויה"
          value={formatCurrency(summary.projectedLumpSumWithDeposits)}
          subtext="צבירה צפויה בגיל פרישה"
        />

        <KpiCard
          icon={<PensionIcon />}
          title="קצבה צפויה"
          value={formatCurrency(summary.monthlyPensionWithDeposits)}
          subtext="קצבה חודשית צפויה"
        />
      </section>

      <section className="member-lower-grid" style={lowerTwoGrid}>
        <SectionCard title="חשיפות אישיות" icon="📊">
          <div className="member-explanation" style={explanation}>
            הצגת רמות החשיפה האישיות למניות ולחו"ל לפי המוצרים המשויכים לבן המשפחה.
          </div>

          <ExposureMetricBlock
            label="חשיפה למניות"
            value={exposures.equity}
            valueText={formatPercent(exposures.equity)}
            description={getExposureLabel(exposures.equity)}
          />

          <div style={{ height: 18 }} />

          <ExposureMetricBlock
            label='חשיפה לחו"ל'
            value={exposures.foreign}
            valueText={formatPercent(exposures.foreign)}
            description={getForeignExposureLabel(exposures.foreign)}
          />
        </SectionCard>

        <SectionCard title="כיסויים ביטוחיים" icon="🛡️">
          <div className="member-explanation" style={explanation}>
            ריכוז הכיסויים הביטוחיים האישיים שנמצאו בקבצים.
          </div>

          <DataRow
            label="ביטוח חיים"
            value={formatCurrency(insurance.deathCoverage)}
          />
          <DataRow
            label="אובדן כושר עבודה"
            value={formatCurrency(insurance.disabilityValue)}
          />
          <DataRow
            label="אחוז אובדן כושר עבודה"
            value={formatPercent(insurance.disabilityPercent)}
          />
        </SectionCard>
      </section>

      <section className="member-compare-grid" style={compareGrid}>
        <SectionCard title="חלוקה לפי גופים מנהלים" icon="🏦">
          <DonutSummaryCard
            title="חלוקה לפי גופים מנהלים"
            subtitle="התפלגות הנכסים האישיים לפי גוף מנהל."
            items={managers}
            formatCurrency={formatCurrency}
          />
        </SectionCard>

        <SectionCard title="חלוקה לפי מוצרים" icon="🥧">
          <DonutSummaryCard
            title="חלוקה לפי מוצרים"
            subtitle="התפלגות הנכסים האישיים לפי תוכניות ומוצרים."
            items={productDistribution}
            formatCurrency={formatCurrency}
          />
        </SectionCard>
      </section>

      <SectionCard title="מוצרים / תוכניות" icon="📄">
        <div className="member-products-header" style={productsHeaderRow}>
          <div>
            <div style={productsHeaderTitle}>פירוט מוצרים / תוכניות</div>
            <div style={productsHeaderSub}>ניתן לסנן לפי סוג מוצר.</div>
          </div>

          <div className="member-filter-print-hide" style={filterWrap}>
            <button
              type="button"
              onClick={() => setFilterOpen((prev) => !prev)}
              style={filterButton}
            >
              <span style={hamburgerIcon}>☰</span>
              <span style={filterButtonText}>{selectedFilterLabel}</span>
              <span style={filterArrow}>{filterOpen ? "▲" : "▼"}</span>
            </button>

            {filterOpen && (
              <div style={filterDropdown}>
                {filterOptions.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => handleFilterSelect(option.id)}
                    style={filterDropdownItem(option.id === productFilter)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {filteredProducts.length ? (
          <div className="member-table-wrap" style={tableWrap}>
            <table className="member-products-table" style={table}>
              <thead>
                <tr>
                  <th style={th}>מוצר</th>
                  <th style={th}>גוף מנהל</th>
                  <th style={th}>סוג מוצר</th>
                  <th style={th}>מספר פוליסה</th>
                  <th style={th}>צבירה</th>
                  <th style={th}>הפקדה חודשית</th>
                  <th style={th}>קצבה צפויה</th>
                  <th style={th}>דמי ניהול מצבירה</th>
                  <th style={th}>חשיפה מנייתית</th>
                  <th style={th}>חשיפה לחו"ל</th>
                </tr>
              </thead>

              <tbody>
                {filteredProducts.map((product) => (
                  <tr key={product.id}>
                    <td style={td}>{product.planName}</td>
                    <td style={td}>{product.managerName}</td>
                    <td style={td}>{product.productType}</td>
                    <td style={td}>{product.policyNo || "—"}</td>
                    <td style={td}>{formatCurrency(product.currentValue)}</td>
                    <td style={td}>{formatCurrency(product.monthlyDeposit)}</td>
                    <td style={td}>
                      {formatCurrency(product.projectedMonthlyPension)}
                    </td>
                    <td style={td}>
                      {Number(product.managementFeeFromBalance || 0).toFixed(2)}%
                    </td>
                    <td style={td}>
                      <ExposureBadge value={product.equityExposure} />
                    </td>
                    <td style={td}>
                      <ExposureBadge value={product.foreignExposure} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyText>אין מוצרים להצגה לפי הסינון שנבחר</EmptyText>
        )}
      </SectionCard>
    </div>
  );
}

function Header({ eyebrow, title, subtitle }) {
  return (
    <section className="member-hero" style={heroHeader}>
      <div style={heroCenter}>
        <div style={heroEyebrow}>{eyebrow}</div>
        <h1 style={heroTitle}>{title}</h1>
        <div style={heroSubtitle}>{subtitle}</div>
      </div>
    </section>
  );
}

function KpiCard({ icon, title, value, subtext }) {
  return (
    <div className="member-kpi-card" style={kpiCard}>
      <div style={kpiIconWrap}>{icon}</div>
      <div style={kpiTitle}>{title}</div>
      <div className="member-kpi-value" style={kpiValue}>{value}</div>
      <div style={kpiSub}>{subtext}</div>
    </div>
  );
}

function SectionCard({ title, icon, children }) {
  return (
    <section className="member-section-card" style={sectionCard}>
      <div style={sectionHeader}>
        <div style={titleWithIcon}>
          {icon ? <span>{icon}</span> : null}
          <h2 style={h2}>{title}</h2>
        </div>
      </div>
      {children}
    </section>
  );
}

function ExposureMetricBlock({ label, value, valueText, description }) {
  return (
    <div>
      <div style={exposureTopRow}>
        <div>
          <div style={exposureLabel}>{label}</div>
          <div style={exposureDescription}>{description}</div>
        </div>

        <div className="member-exposure-value" style={exposureValue}>{valueText}</div>
      </div>

      <ModernBar value={value} />
    </div>
  );
}

function DataRow({ label, value }) {
  return (
    <div style={dataRow}>
      <div style={dataLabel}>{label}</div>
      <div style={dataValue}>{value}</div>
    </div>
  );
}

function EmptyText({ children }) {
  return <div style={emptyState}>{children}</div>;
}

function ModernBar({ value }) {
  const safe = Math.max(0, Math.min(100, Number(value || 0)));

  return (
    <div style={{ paddingTop: 6 }}>
      <div style={modernTrack}>
        <div style={{ ...modernFill, width: `${safe}%` }} />
      </div>

      <div style={barScale}>
        <span>0%</span>
        <span>25%</span>
        <span>50%</span>
        <span>75%</span>
        <span>100%</span>
      </div>
    </div>
  );
}

function DonutSummaryCard({ title, subtitle, items, formatCurrency }) {
  const data = buildSegments(items);

  if (!data.segments.length) {
    return (
      <section className="member-donut-card" style={{ ...donutCard, border: "none", boxShadow: "none" }}>
        <h3 style={donutTitle}>{title}</h3>
        <div style={{ ...smallText, marginTop: 6 }}>{subtitle}</div>
        <EmptyText>אין נתונים להצגה</EmptyText>
      </section>
    );
  }

  return (
    <section className="member-donut-card" style={{ ...donutCard, border: "none", boxShadow: "none" }}>
      <h3 style={donutTitle}>{title}</h3>
      <div style={{ ...smallText, marginTop: 6 }}>{subtitle}</div>

      <div className="member-donut-layout" style={donutLayout}>
        <div className="member-donut-chart" style={{ display: "flex", justifyContent: "center" }}>
          <ExplodedDonutChart segments={data.segments} size={150} />
        </div>

        <div style={legendList}>
          {data.segments.slice(0, 6).map((seg, index) => (
            <LegendRow
              key={`${seg.id || seg.name}-${index}`}
              seg={seg}
              formatCurrency={formatCurrency}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function ExplodedDonutChart({ segments, size = 150 }) {
  const center = size / 2;
  const outerRadius = size * 0.34;
  const innerRadius = size * 0.21;
  const explode = size * 0.035;
  const gapDegrees = 1.2;
  const depthOffset = size * 0.035;
  const filterId = `donutShadow_${size}`;

  const arcSegments = segments.map((seg) => {
    const startAngle = (seg.start / 100) * 360 - 90 + gapDegrees / 2;
    const endAngle = (seg.end / 100) * 360 - 90 - gapDegrees / 2;
    const midAngle = (startAngle + endAngle) / 2;
    const offsetX = Math.cos(toRad(midAngle)) * explode;
    const offsetY = Math.sin(toRad(midAngle)) * explode;

    return {
      ...seg,
      path: describeDonutArc(center, center, outerRadius, innerRadius, startAngle, endAngle),
      depthPath: describeDonutArc(
        center,
        center + depthOffset,
        outerRadius,
        innerRadius,
        startAngle,
        endAngle
      ),
      offsetX,
      offsetY,
    };
  });

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ display: "block", overflow: "visible" }}
    >
      <defs>
        <filter id={filterId} x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="#00215D" floodOpacity="0.16" />
        </filter>
      </defs>

      {arcSegments.map((seg, index) => (
        <path
          key={`depth-${seg.name}-${index}`}
          d={seg.depthPath}
          fill={darkenColor(seg.color, 0.72)}
          transform={`translate(${seg.offsetX} ${seg.offsetY})`}
          opacity="0.95"
        />
      ))}

      {arcSegments.map((seg, index) => (
        <g
          key={`top-${seg.name}-${index}`}
          transform={`translate(${seg.offsetX} ${seg.offsetY})`}
          filter={`url(#${filterId})`}
        >
          <path d={seg.path} fill={seg.color} stroke="rgba(255,255,255,0.88)" strokeWidth="1.2" />
          <path d={seg.path} fill="rgba(255,255,255,0.12)" />
        </g>
      ))}

      <circle
        cx={center}
        cy={center}
        r={innerRadius - 1}
        fill="#fff"
        filter={`url(#${filterId})`}
      />
    </svg>
  );
}

function describeDonutArc(cx, cy, outerR, innerR, startAngle, endAngle) {
  const largeArcFlag = endAngle - startAngle <= 180 ? 0 : 1;

  const p1 = polarToCartesian(cx, cy, outerR, endAngle);
  const p2 = polarToCartesian(cx, cy, outerR, startAngle);
  const p3 = polarToCartesian(cx, cy, innerR, startAngle);
  const p4 = polarToCartesian(cx, cy, innerR, endAngle);

  return [
    `M ${p1.x} ${p1.y}`,
    `A ${outerR} ${outerR} 0 ${largeArcFlag} 0 ${p2.x} ${p2.y}`,
    `L ${p3.x} ${p3.y}`,
    `A ${innerR} ${innerR} 0 ${largeArcFlag} 1 ${p4.x} ${p4.y}`,
    "Z",
  ].join(" ");
}

function polarToCartesian(cx, cy, radius, angleInDegrees) {
  const angleInRadians = toRad(angleInDegrees);
  return {
    x: cx + radius * Math.cos(angleInRadians),
    y: cy + radius * Math.sin(angleInRadians),
  };
}

function toRad(degrees) {
  return (degrees * Math.PI) / 180;
}

function darkenColor(hex, factor = 0.75) {
  const normalized = String(hex || "#00215D").replace("#", "");
  const full = normalized.length === 3
    ? normalized.split("").map((c) => c + c).join("")
    : normalized;

  const r = Math.max(0, Math.min(255, Math.round(parseInt(full.slice(0, 2), 16) * factor)));
  const g = Math.max(0, Math.min(255, Math.round(parseInt(full.slice(2, 4), 16) * factor)));
  const b = Math.max(0, Math.min(255, Math.round(parseInt(full.slice(4, 6), 16) * factor)));

  return `rgb(${r}, ${g}, ${b})`;
}

function buildSegments(items) {
  const safeItems = Array.isArray(items)
    ? items.filter((item) => Number(item.value || 0) > 0)
    : [];

  const total = safeItems.reduce(
    (sum, item) => sum + Number(item.value || 0),
    0
  );

  if (!safeItems.length || total <= 0) {
    return { segments: [], gradient: "#D7DEE7 0% 100%" };
  }

  let current = 0;

  const segments = safeItems.map((item, index) => {
    const value = Number(item.value || 0);
    const percent = (value / total) * 100;
    const start = current;
    const end = current + percent;
    current = end;

    return {
      ...item,
      value,
      percent,
      start,
      end,
      color: chartColors[index % chartColors.length],
    };
  });

  const gradient = segments
    .map((seg) => `${seg.color} ${seg.start}% ${seg.end}%`)
    .join(", ");

  return { segments, gradient };
}

function LegendRow({ seg, formatCurrency }) {
  return (
    <div style={legendRow}>
      <span style={{ ...legendDot, background: seg.color }} />
      <div style={{ minWidth: 0 }}>
        <div style={legendName}>{seg.name}</div>
        <div style={legendSub}>{formatCurrency(seg.value)}</div>
      </div>
      <div style={legendPercent}>{Math.round(seg.percent)}%</div>
    </div>
  );
}

function ExposureBadge({ value }) {
  const num = Number(value || 0);
  const color = num > 60 ? "#D14343" : num > 30 ? "#F0B43C" : "#3EAF63";

  return (
    <span style={{ color, fontWeight: 800 }}>
      {num > 0 ? `${Math.round(num)}%` : "—"}
    </span>
  );
}

function getExposureLabel(value) {
  const num = Number(value || 0);
  if (num <= 30) return "חשיפה נמוכה";
  if (num <= 60) return "חשיפה בינונית";
  return "חשיפה גבוהה";
}

function getForeignExposureLabel(value) {
  const num = Number(value || 0);
  if (num <= 25) return "חשיפה נמוכה לחו״ל";
  if (num <= 50) return "חשיפה בינונית לחו״ל";
  return "חשיפה גבוהה לחו״ל";
}

function AssetsIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
      <path d="M4 18V9" stroke="#00215D" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M10 18V5" stroke="#00215D" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M16 18V12" stroke="#00215D" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M3 19H21" stroke="#FF2756" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

function DepositIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
      <path d="M12 3V14" stroke="#FF2756" strokeWidth="2.2" strokeLinecap="round" />
      <path
        d="M8.5 6.5L12 3L15.5 6.5"
        stroke="#FF2756"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect
        x="4"
        y="14"
        width="16"
        height="6"
        rx="2"
        stroke="#00215D"
        strokeWidth="2.2"
      />
    </svg>
  );
}

function SavingsIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
      <path
        d="M5 12C5 8.7 8.1 6 12 6C15.9 6 19 8.7 19 12C19 15.3 15.9 18 12 18C8.1 18 5 15.3 5 12Z"
        stroke="#00215D"
        strokeWidth="2.2"
      />
      <path d="M12 8.5V15.5" stroke="#FF2756" strokeWidth="2.2" strokeLinecap="round" />
      <path
        d="M9.7 10.5H13.2C14.1 10.5 14.7 11 14.7 11.8C14.7 12.6 14.1 13.1 13.2 13.1H10.8"
        stroke="#FF2756"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PensionIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
      <path
        d="M6 20V8L12 4L18 8V20"
        stroke="#00215D"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <path
        d="M9 20V13H15V20"
        stroke="#FF2756"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <path d="M4 20H20" stroke="#00215D" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

const theme = {
  surface: "#FFFFFF",
  surfaceAlt: "#FCFBF8",
  border: "#E2D1BF",
  divider: "#EEE4D8",
  text: "#102A43",
  textSoft: "#627D98",
  navy: "#00215D",
  navyDark: "#001845",
  accent: "#FF2756",
  softBlue: "#EAF1FB",
};

const chartColors = [
  "#00215D",
  "#FF2756",
  "#1F77B4",
  "#43B5D9",
  "#8F63C9",
  "#F0B43C",
  "#9FD0E6",
  "#8FB996",
  "#C08497",
  "#7B8CBF",
];

const page = {
  direction: "rtl",
  fontFamily: 'Calibri, "Arial", sans-serif',
  fontSize: 12,
  lineHeight: 1.6,
  color: theme.text,
};

const heroHeader = {
  background: `linear-gradient(135deg, ${theme.navy}, ${theme.navyDark})`,
  color: "#fff",
  borderRadius: 24,
  padding: "24px 26px",
  boxShadow: "0 8px 28px rgba(0,33,93,0.14)",
  marginBottom: 18,
};

const heroCenter = { textAlign: "center" };

const heroEyebrow = {
  fontSize: 12,
  color: "rgba(255,255,255,0.78)",
  marginBottom: 8,
  fontWeight: 700,
};

const heroTitle = {
  margin: 0,
  fontSize: 30,
  fontWeight: 700,
  lineHeight: 1.2,
  color: "#fff",
};

const heroSubtitle = {
  margin: "12px auto 0",
  maxWidth: 760,
  fontSize: 12,
  lineHeight: 1.8,
  color: "rgba(255,255,255,0.9)",
};

const topGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 18,
  marginBottom: 18,
};

const lowerTwoGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 18,
  marginBottom: 18,
};

const compareGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 18,
  marginBottom: 18,
};

const kpiCard = {
  background: theme.surface,
  border: `1px solid ${theme.border}`,
  borderRadius: 20,
  padding: 20,
  minHeight: 188,
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  alignItems: "center",
  textAlign: "center",
  boxShadow: "0 2px 10px rgba(16,42,67,0.05)",
};

const kpiIconWrap = {
  width: 74,
  height: 74,
  borderRadius: 22,
  background: "#F4F7FB",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  marginBottom: 14,
};

const kpiTitle = {
  fontSize: 14,
  color: theme.textSoft,
  fontWeight: 700,
  marginBottom: 10,
};

const kpiValue = {
  fontSize: 34,
  lineHeight: 1.1,
  fontWeight: 700,
  color: theme.navy,
  marginBottom: 10,
};

const kpiSub = {
  fontSize: 12,
  color: "#7A8CA8",
  lineHeight: 1.7,
  maxWidth: 260,
  margin: "0 auto",
};

const sectionCard = {
  background: theme.surface,
  border: `1px solid ${theme.border}`,
  borderRadius: 20,
  padding: 20,
  boxShadow: "0 2px 10px rgba(16,42,67,0.05)",
  marginBottom: 18,
};

const sectionHeader = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  flexWrap: "wrap",
  marginBottom: 10,
};

const titleWithIcon = {
  display: "flex",
  alignItems: "center",
  gap: 10,
};

const h2 = {
  margin: 0,
  fontSize: 14,
  color: theme.navy,
  fontWeight: 700,
  lineHeight: 1.4,
};

const explanation = {
  fontSize: 12,
  color: theme.textSoft,
  lineHeight: 1.7,
  marginBottom: 16,
};

const dataRow = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  padding: "10px 0",
  borderBottom: `1px solid ${theme.divider}`,
  fontSize: 12,
};

const dataLabel = { color: theme.textSoft };

const dataValue = {
  color: theme.navy,
  fontWeight: 700,
};

const exposureTopRow = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "baseline",
  gap: 12,
  marginBottom: 10,
};

const exposureLabel = {
  fontSize: 12,
  color: theme.textSoft,
  fontWeight: 700,
};

const exposureDescription = {
  fontSize: 14,
  color: theme.navy,
  fontWeight: 700,
  marginTop: 4,
};

const exposureValue = {
  fontSize: 30,
  color: theme.navy,
  fontWeight: 700,
  lineHeight: 1.1,
};

const modernTrack = {
  position: "relative",
  height: 16,
  borderRadius: 999,
  background:
    "linear-gradient(90deg, #F9F7F3 0%, #EAF1FB 45%, #E2D1BF 75%, #00215D 100%)",
  overflow: "hidden",
};

const modernFill = {
  height: "100%",
  borderRadius: 999,
  background: `linear-gradient(90deg, ${theme.accent} 0%, ${theme.navy} 100%)`,
  boxShadow: "0 1px 3px rgba(0,33,93,0.25)",
};

const barScale = {
  display: "flex",
  justifyContent: "space-between",
  marginTop: 10,
  fontSize: 12,
  color: theme.textSoft,
  direction: "ltr",
};

const donutCard = {
  background: theme.surface,
  border: `1px solid ${theme.border}`,
  borderRadius: 20,
  padding: 0,
  minHeight: "auto",
};

const donutTitle = {
  margin: 0,
  color: theme.navy,
  fontSize: 14,
  fontWeight: 700,
};

const smallText = {
  fontSize: 12,
  color: theme.textSoft,
  lineHeight: 1.6,
};

const donutLayout = {
  display: "grid",
  gridTemplateColumns: "150px 1fr",
  gap: 18,
  alignItems: "center",
  marginTop: 12,
};

const legendList = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const legendRow = {
  display: "grid",
  gridTemplateColumns: "12px 1fr auto",
  gap: 8,
  alignItems: "center",
  fontSize: 12,
};

const legendDot = {
  width: 12,
  height: 12,
  borderRadius: "50%",
  display: "inline-block",
};

const legendName = {
  color: theme.text,
  fontWeight: 700,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const legendSub = {
  color: theme.textSoft,
  fontSize: 11,
  marginTop: 2,
};

const legendPercent = {
  color: theme.navy,
  fontWeight: 700,
  fontSize: 11,
};

const productsHeaderRow = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 14,
  flexWrap: "wrap",
  marginBottom: 16,
};

const productsHeaderTitle = {
  fontSize: 14,
  fontWeight: 700,
  color: theme.navy,
};

const productsHeaderSub = {
  fontSize: 12,
  color: theme.textSoft,
  marginTop: 4,
};

const filterWrap = {
  position: "relative",
  minWidth: 260,
};

const filterButton = {
  width: "100%",
  minHeight: 42,
  borderRadius: 12,
  border: `1px solid ${theme.border}`,
  background: "#fff",
  color: theme.navy,
  fontFamily: 'Calibri, "Arial", sans-serif',
  fontSize: 12,
  fontWeight: 800,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  padding: "10px 14px",
};

const hamburgerIcon = {
  fontSize: 16,
  color: theme.navy,
};

const filterButtonText = {
  flex: 1,
  textAlign: "right",
};

const filterArrow = {
  fontSize: 11,
  color: theme.navy,
};

const filterDropdown = {
  position: "absolute",
  top: "calc(100% + 8px)",
  right: 0,
  left: 0,
  background: "#fff",
  border: `1px solid ${theme.border}`,
  borderRadius: 14,
  boxShadow: "0 14px 34px rgba(16,42,67,0.14)",
  padding: 8,
  zIndex: 20,
  maxHeight: 320,
  overflowY: "auto",
};

const filterDropdownItem = (active) => ({
  width: "100%",
  padding: "11px 12px",
  borderRadius: 10,
  border: "none",
  background: active ? "#F4F7FB" : "#fff",
  color: active ? theme.navy : theme.text,
  fontFamily: 'Calibri, "Arial", sans-serif',
  fontWeight: 800,
  fontSize: 12,
  cursor: "pointer",
  textAlign: "right",
});

const tableWrap = {
  overflowX: "auto",
  borderRadius: 14,
  border: `1px solid ${theme.divider}`,
  background: "#fff",
};

const table = {
  width: "100%",
  borderCollapse: "collapse",
  minWidth: 1100,
  background: "#fff",
};

const th = {
  textAlign: "right",
  padding: 12,
  fontSize: 12,
  color: theme.textSoft,
  borderBottom: `1px solid ${theme.divider}`,
  whiteSpace: "nowrap",
  fontWeight: 700,
  background: "#FAF8F4",
};

const td = {
  textAlign: "right",
  padding: 12,
  fontSize: 12,
  color: theme.text,
  borderBottom: "1px solid #F0E6DA",
  whiteSpace: "nowrap",
};

const emptyState = {
  background: theme.surfaceAlt,
  border: `1px dashed ${theme.border}`,
  borderRadius: 14,
  padding: 18,
  fontSize: 12,
  color: theme.textSoft,
  lineHeight: 1.7,
};

export default ClientMemberView;
