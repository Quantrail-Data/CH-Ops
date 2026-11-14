import { useNavigate } from "react-router-dom";
import imageSrc from "../../assets/co.png";
import useEmptyContainerHeight from "../../hooks/useEmptyContainerHeight";
import { useTheme } from "../../App";


function ErrorClusterConnected({ title, message, mainRef }) {
  const { memoHeightAppMain } = useEmptyContainerHeight(
    mainRef?.current?.clientHeight,
    mainRef,
  );
  const navigate = useNavigate()
  const navigateCluster = () => {
    navigate("/admin/cluster")
  }
  const {theme} = useTheme()
  const isDark = theme === "dark"
  return (
    <div
      className="empty-state"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: `${memoHeightAppMain}px`,
      }}
    >
      <div
        style={{
          // backgroundColor: isDark ? "#21283A" : "transparent",
          borderRadius: "10px",
          display: "flex",
          border: isDark ? "1px solid #c0a5ff9e" : "1px solid var(--border-default)",
          alignItems: "center",
          justifyContent: "center",
          padding: "5px",
          margin: "auto",
          width: "38rem",
          flexDirection: "column",
          boxShadow:"var(--shadow-glow)"

        }}
        className="glass-card"
      >
        <div>
          <img src={imageSrc} style={{ width: "140px" }} />
        </div>

        <div>
          <h4>{title}</h4>
          <span style={{ fontSize: "13px" }}>{message}</span>
        </div>

        <div
          style={{
            width: "100%",
            margin: "15px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "10px",
          }}
        >
          <button
            style={{
              width: "45%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            className="btn btn-primary"
            onClick={()=>navigateCluster()}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLineCap="round"
              strokeLineJoin="round"
              className="icon icon-tabler icons-tabler-outline icon-tabler-plus"
            >
              <path stroke="none" d="M0 0h24v24H0z" fill="none" />
              <path d="M12 5l0 14" />
              <path d="M5 12l14 0" />
            </svg>
            Add Cluster
          </button>
          <button
            style={{
              width: "45%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            className="btn btn-secondary"
            onClick={()=>{
              const currentURL = window?.location?.host || 'http://localhost:5344';
              window.location.href = currentURL + "/docs/#/guide/admin?id=cluster-management"
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLineCap="round"
              strokeLineJoin="round"
              className="icon icon-tabler icons-tabler-outline icon-tabler-article"
            >
              <path stroke="none" d="M0 0h24v24H0z" fill="none" />
              <path d="M3 6a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2l0 -12" />
              <path d="M7 8h10" />
              <path d="M7 12h10" />
              <path d="M7 16h10" />
            </svg>
            View Documentation
          </button>
        </div>
      </div>
    </div>
  );
}

export default ErrorClusterConnected;
