export default function ToggleSwitch({
  checked = false,
  onChange,
  label,
  info=null
}) {
  return (
    <div
      className="form-group"
      style={{
        display: "flex",
        alignItems: "center",
        paddingTop: 22,
        gap: 6,
      }}
    >
      <div className="form-label">
        <label
          className="switch"
          style={{
            display: "flex",
            gap: 6,
            cursor: "pointer",
            fontSize: "14px",
            marginRight: "5px",
          }}
        >
          <input
            type="checkbox"
            checked={checked}
            onChange={onChange}
            style={{ accentColor: "var(--accent)" }}
          />{" "}
          <span class="slider"></span>
        </label>
        {label}
         {info && <small
                style={{
                  display: "block",
                  color: "var(--text-muted)",
                  fontSize: 11,
                  marginTop: 2,
                }}
              >
               {info}
              </small>}
      </div>
    </div>
  );
}
