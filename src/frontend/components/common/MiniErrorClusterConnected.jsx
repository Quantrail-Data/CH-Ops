import { useNavigate } from "react-router-dom";
import imageSrc from "../../assets/co.png";
import { useTheme } from "../../App";
import { Button } from "../ui/index.jsx";

function MiniErrorClusterConnected({ title, message }) {
 
  const navigate = useNavigate();
  const navigateCluster = () => {
    navigate("/admin/cluster");
  };
  const { theme } = useTheme();
  const isDark = theme === "dark";
  return (
    <div
      style={{
        backgroundColor: "var(--bg-page)",
        borderRadius: "10px",
        display: "flex",
        border: isDark
          ? "1px solid #c0a5ff5f"
          : "1px solid var(--border-default)",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "10px 10px",
        margin: "auto",
        flexDirection: "row",
        boxShadow: "var(--shadow-glow)",
        position: "absolute",
        bottom: "3rem",
        zIndex:"100000"
      }}
      className="glass-card"
    >
   
        <div>
          <img src={imageSrc} style={{ width: "70px" }} />
        </div>

        <div>
          <h5>{title}</h5>
          <span style={{ fontSize: "0.625rem",lineHeight:"5px" }}>{message}</span>
          <div
          style={{
            width: "100%",
            display: "flex",
            alignItems: "start",
            justifyContent: "start",
            flexDirection:"row",
            gap: "10px",
            margin:"10px 0px"
          }}
        >
          <Button
            style={{ width: "45%" }}
            variant="primary"
            onClick={()=>navigateCluster()}
          >
            
            Add Cluster
          </Button>
          <Button
            style={{ width: "45%" }}
            variant="secondary"
            onClick={()=>{
              const currentURL = window?.location?.host || 'http://localhost:5344';
              window.location.href = currentURL + "/docs/#/guide/admin?id=cluster-management"
            }}
          >
            
            View Documentation
          </Button>
        </div>
        </div>
 
      
    </div>
  );
}

export default MiniErrorClusterConnected;
