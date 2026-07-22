/**
 * React auto-appends "px" to numeric inline-style values (except a fixed set of
 * unitless properties). Vue (both templates and JSX) does not. `px()` replicates
 * React's behaviour so the ported style objects can stay a 1:1 copy of the
 * original JSX. It is applied to every `style={...}` value by the conversion.
 */
const UNITLESS = new Set([
  "animationIterationCount", "borderImageOutset", "borderImageSlice",
  "borderImageWidth", "boxFlex", "boxFlexGroup", "boxOrdinalGroup",
  "columnCount", "columns", "flex", "flexGrow", "flexPositive", "flexShrink",
  "flexNegative", "flexOrder", "gridArea", "gridRow", "gridRowEnd",
  "gridRowSpan", "gridRowStart", "gridColumn", "gridColumnEnd",
  "gridColumnSpan", "gridColumnStart", "fontWeight", "lineClamp", "lineHeight",
  "opacity", "order", "orphans", "tabSize", "widows", "zIndex", "zoom",
  "fillOpacity", "floodOpacity", "stopOpacity", "strokeDasharray",
  "strokeDashoffset", "strokeMiterlimit", "strokeOpacity", "strokeWidth",
]);

export function px(styleValue) {
  if (styleValue == null || typeof styleValue === "string") return styleValue;
  if (Array.isArray(styleValue)) return styleValue.map(px);
  if (typeof styleValue !== "object") return styleValue;

  const result = {};
  for (const key in styleValue) {
    const value = styleValue[key];
    result[key] =
      typeof value === "number" && value !== 0 && !UNITLESS.has(key)
        ? `${value}px`
        : value;
  }
  return result;
}
