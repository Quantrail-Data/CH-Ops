import { motion } from "motion/react";
import Icon from "./Icon";
import { useTheme } from "../../App";



function AIDDLModelComponent({
    SelectTablehandler,
    dbLoading,
    newSelection,
    genTables,
    setShowDBModel,
    selectAllHandler,
    databaseSchemaSetterHandler,
    isNewSelectAll,
    isEnableAddButton,
    estimateScore,
    GenerateDDL_EsitmateHandler,
    isEmptyTableAndDatabase,
    DeleteDatabaseDDLHandler,
    alertMessage,
    isSelectDb,
    isDisableSelectDb,
    isSelectTable,
    selectDBGenerateID,
    responseBodyStructTableDatabase,
}) {

    const {theme} = useTheme()

  function isDark() {
    return theme === "dark";
  }


  return (
    <div className="modal-overlay" style={{ zIndex: "100000", padding: "0px" }}>
      <motion.div
        initial={{ scale: 0.99 }}
        animate={{ scale: 1 }}
        style={{
          width: "50rem",
          backgroundColor: "var(--bg-page)",
          borderRadius: "10px",
          padding: "15px",
          position: "relative",
          maxHeight: "80vh",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "30px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <Icon className="ti ti-database" />
              <h5>Database Schema & Estimate Generator</h5>
            </div>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
            }}
          >
            <button
              className="btn btn-ghost"
              onClick={() => setShowDBModel(false)}
            >
              <Icon className="ti ti-x" />
            </button>
          </div>
        </div>
        {alertMessage?.flag && (
          <div
            className={`alert-banner info`}
            style={{ fontSize: "12px", margin: "10px 0px" }}
          >
            {alertMessage?.message}
          </div>
        )}
        {/* non-selected */}
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <h5>Databases</h5>{" "}
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <button
                onClick={() => selectAllHandler("new")}
                className={`btn btn-ghost`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: isNewSelectAll ? "var(--accent)" : undefined,
                  color: isNewSelectAll && "white",
                  ...{
                    fontSize: "11px",
                    padding: "5px 10px",
                    height: "30px",
                  },
                }}
              >
                {!isNewSelectAll ? (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="17"
                    height="17"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="icon icon-tabler icons-tabler-outline icon-tabler-select-all"
                  >
                    <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                    <path d="M8 9a1 1 0 0 1 1 -1h6a1 1 0 0 1 1 1v6a1 1 0 0 1 -1 1h-6a1 1 0 0 1 -1 -1l0 -6" />
                    <path d="M12 20v.01" />
                    <path d="M16 20v.01" />
                    <path d="M8 20v.01" />
                    <path d="M4 20v.01" />
                    <path d="M4 16v.01" />
                    <path d="M4 12v.01" />
                    <path d="M4 8v.01" />
                    <path d="M4 4v.01" />
                    <path d="M8 4v.01" />
                    <path d="M12 4v.01" />
                    <path d="M16 4v.01" />
                    <path d="M20 4v.01" />
                    <path d="M20 8v.01" />
                    <path d="M20 12v.01" />
                    <path d="M20 16v.01" />
                    <path d="M20 20v.01" />
                  </svg>
                ) : (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="17"
                    height="17"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="icon icon-tabler icons-tabler-outline icon-tabler-deselect"
                  >
                    <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                    <path d="M12 8h3a1 1 0 0 1 1 1v3" />
                    <path d="M16 16h-7a1 1 0 0 1 -1 -1v-7" />
                    <path d="M12 20v.01" />
                    <path d="M16 20v.01" />
                    <path d="M8 20v.01" />
                    <path d="M4 20v.01" />
                    <path d="M4 16v.01" />
                    <path d="M4 12v.01" />
                    <path d="M4 8v.01" />
                    <path d="M8 4v.01" />
                    <path d="M12 4v.01" />
                    <path d="M16 4v.01" />
                    <path d="M20 4v.01" />
                    <path d="M20 8v.01" />
                    <path d="M20 12v.01" />
                    <path d="M20 16v.01" />
                    <path d="M3 3l18 18" />
                  </svg>
                )}
                <span style={{ fontSize: "11px" }}>
                  {isNewSelectAll ? "Deselect All" : "Select All"}
                </span>
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  databaseSchemaSetterHandler("add");
                }}
                style={{
                  fontSize: "11px",
                  padding: "5px 10px",
                  height: "30px",
                }}
                disabled={newSelection?.length === 0 || !isEnableAddButton()}
              >
                <>
                  {" "}
                  <Icon className="ti ti-plus" />
                  Get Tables
                </>
              </button>
            </div>
          </div>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              width: "100%",
              margin: "20px auto",
              minHeight: "100px",
              maxHeight: "300px",
              alignItems: "start",
              gap: "10px",
            }}
            className="alert-banner dbcard"
          >
            {newSelection?.length > 0 ? (
              newSelection?.map((_b, i) => {
                return (
                  <div
                    key={`${i}-${_b?.name}`}
                    onClick={() => selectDBGenerateID(_b?.name, "new")}
                    className="db-select-model"
                    style={{
                      cursor: "pointer",
                      margin: "3px",
                      padding: "5px 15px",
                      borderRadius: "5px",
                      border: "1px solid var(--border-default)",
                      display: "flex",
                      alignItems: "center",
                      backgroundColor:
                        isSelectDb(_b?.name, "new") ||
                        isDisableSelectDb(_b?.name)
                          ? "var(--accent)"
                          : "transparent",
                      color:
                        isSelectDb(_b?.name, "new") ||
                        isDisableSelectDb(_b?.name)
                          ? "white"
                          : isDark()
                            ? "lightgray"
                            : "gray",
                      gap: "10px",
                    }}
                  >
                    <span style={{ fontSize: "12px", fontWeight: "700" }}>
                      {_b?.name}
                    </span>
                  </div>
                );
              })
            ) : (
              <div></div>
            )}
          </div>
        </div>
        <div
          style={{
            width: "100%",
            height: "1px",
            backgroundColor: "var(--border-default)",
            margin: "30px 0px",
          }}
        ></div>

        {/* selected */}
        <div style={{ width: "100%" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <h5>Database & Tables</h5>
            <div style={{ gap: "10px", display: "flex" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                }}
                className="btn btn-ghost"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="orange"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="icon icon-tabler icons-tabler-outline icon-tabler-chart-column"
                >
                  <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                  <path d="M4 20h3" />
                  <path d="M17 20h3" />
                  <path d="M10.5 20h3" />
                  <path d="M4 16h3" />
                  <path d="M17 16h3" />
                  <path d="M10.5 16h3" />
                  <path d="M4 12h3" />
                  <path d="M17 12h3" />
                  <path d="M10.5 12h3" />
                  <path d="M4 8h3" />
                  <path d="M17 8h3" />
                  <path d="M4 4h3" />
                </svg>
                <span style={{ fontSize: "10px" }}>
                  Estimate : {estimateScore ? estimateScore : 0}
                </span>
              </div>
              <button
                className="btn btn-primary"
                // disabled={!isEnableRefreshSchema()}
                onClick={() => GenerateDDL_EsitmateHandler()}
                style={{
                  fontSize: "11px",
                  padding: "5px 10px",
                  height: "30px",
                }}
              >
                <>
                  <Icon className="ti ti-refresh" />
                  Generate DDL & Estimate
                </>
              </button>
            </div>
          </div>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              width: "100%",
              margin: "20px auto",
              minHeight: "100px",
              maxHeight: "300px",
              alignItems: "start",
              overflowY: "auto",
            }}
            className=""
          >
            {isEmptyTableAndDatabase() ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "100%",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    flexDirection: "column",
                  }}
                >
                  <Icon className="ti ti-info-circle" />
                  <span style={{ fontSize: "10px" }}>
                    No Table and DDL info founded!
                  </span>
                </div>
              </div>
            ) : (
              <div style={{ width: "100%" }}>
                {Object.keys(genTables)?.map((_v, idx) => {
                  return (
                    <div style={{ width: "100%" }} key={idx}>
                      <div
                        style={{
                          width: "100%",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                        }}
                      >
                        <h3
                          style={{
                            fontSize: "13px",
                            paddingBottom: "8px",
                            margin: "5px 0px",
                            display: "flex",
                            alignItems: "center",
                            gap: "5px",
                          }}
                        >
                          {" "}
                          <Icon
                            className="ti ti-database"
                            style={{ fontSize: "13px" }}
                          />
                          {_v}
                        </h3>
                        <button
                          className="btn btn-ghost"
                          title={`Delete the DDL of ${_v}`}
                          onClick={() => DeleteDatabaseDDLHandler(_v)}
                        >
                          <Icon className="ti ti-trash" />
                        </button>
                      </div>
                      <div
                        style={{
                          width: "100%",
                          display: "flex",
                          flexWrap: "wrap",
                        }}
                      >
                        {genTables[_v]?.map((_t, idx) => {
                          return (
                            <div
                              onClick={() => SelectTablehandler(_v, _t?.table)}
                              key={`tables_${idx}_${_t?.table}`}
                              className="db-select-model"
                              style={{
                                cursor: "pointer",
                                margin: "3px",
                                padding: "5px 15px",
                                borderRadius: "5px",
                                border: "1px solid var(--border-default)",
                                display: "flex",
                                alignItems: "center",
                                backgroundColor: isSelectTable(_v, _t?.table)
                                  ? "var(--accent)"
                                  : "transparent",
                                color: isSelectTable(_v, _t?.table)
                                  ? "white"
                                  : isDark()
                                    ? "lightgray"
                                    : "gray",
                                gap: "10px",
                              }}
                            >
                              <Icon
                                className="ti ti-table"
                                style={{ fontSize: "13px" }}
                              />
                              <span
                                style={{
                                  fontSize: "12px",
                                  fontWeight: "700",
                                }}
                              >
                                {_t?.table}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {dbLoading?.flag && (
          <div
            className="model-loading-schema"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexDirection: "column",
              gap: "20px",
            }}
          >
            <div
              className="loading-spinner"
              style={{ width: "30px", height: "30px" }}
            ></div>
            <h5>{dbLoading?.message}</h5>
          </div>
        )}
      </motion.div>
    </div>
  );
}

export default AIDDLModelComponent;
