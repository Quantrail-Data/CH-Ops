// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> Praveen kumar
// Inline SQL editor embedded within the chat interface for modifying and executing AI-generated queries.

import React, { useState, useRef } from 'react';
import Icon from "../common/Icon.jsx";
import {useQuriozChatContext} from "../../App"

// SQL Editor with Line Numbers Component
const SQLEditorWithLines = ({ value, onChange, onKeyDown }) => {
  const textareaRef = useRef(null);
  const lineNumbersRef = useRef(null);

  const lines = value.split('\n');

  const handleScroll = () => {
    if (textareaRef.current && lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  const handleChange = (e) => {
    onChange(e);
    handleScroll();
  };

  return (
    <div
  style={{
    display: "flex",
    backgroundColor: "#1f2937",
    borderRadius: "6px",
    overflow: "hidden",
    border: "1px solid #4b5563",
  }}
>
  {/* Line Numbers */}
  <div
    ref={lineNumbersRef}
    style={{
      backgroundColor: "#111827",
      color: "#9ca3af",
      textAlign: "right",
      padding: "12px 8px",
      fontFamily: "var(--font-code)",
      fontSize: "12px",
      userSelect: "none",
      overflow: "hidden",
      minWidth: "30px",
      width: "auto",
      lineHeight: "1.5",
    }}
  >
    {lines.map((_, index) => (
      <div
        key={index + 1}
        style={{
          paddingRight: "8px",
        }}
      >
        {index + 1}
      </div>
    ))}
  </div>


  <textarea
    ref={textareaRef}
    value={value}
    onChange={handleChange}
    onKeyDown={onKeyDown}
    onScroll={handleScroll}
    spellCheck={false}
    style={{
      flex: 1,
      backgroundColor: "#1f2937",
      color: "#f3f4f6",
      padding: "12px",
      fontFamily: "var(--font-code)",
      fontSize: "12px",
      resize: "vertical",
      minHeight: "120px",
      outline: "none",
      border: "none",
      overflowWrap: "anywhere",
      wordBreak: "break-word",
      lineHeight: "1.4",
      scrollbarWidth: "thin",
      scrollbarColor: "#4B5563 #1F2937",
    }}
  />
</div>
  );
};

const SQLQueryEditorComponent = ({ chat,RunSqlQueryhandler }) => {
  const [editingSql, setEditingSql] = useState({
    isEditing: false,
    sql: chat.sql,
    originalSql: chat.sql
  });
  const {replaceChat} = useQuriozChatContext()
  const [isLoading,setIsLoading] = useState(false);
  const [isCopy,setIsCopy] = useState(false);




  const copyHandler = ()=>{
    setIsCopy(true);
    if (navigator?.clipboard && navigator?.clipboard?.writeText) {
      navigator?.clipboard?.writeText(chat?.sql);
      setTimeout(()=>{
        setIsCopy(false)
      },1000)
    }
  }





  const handleEditSql = () => {
    setEditingSql({
      isEditing: true,
      sql: chat.sql,
      originalSql: chat.sql
    });
  };

  const handleCancelEditSql = () => {
    setEditingSql({
      isEditing: false,
      sql: chat.sql,
      originalSql: chat.sql
    });
  };

  const handleSqlChange = (e) => {
    setEditingSql(prev => ({
      ...prev,
      sql: e.target.value
    }));
  };

  const handleUpdateSql =async () => {
    setIsLoading(true);
    const response = await RunSqlQueryhandler(editingSql?.sql);
    let  updatedResponse ;
    if (response?.success) {
      updatedResponse = {...chat,error:{status:false,message:null},sql:editingSql?.sql,tableData: response?.rows}
      

    }else {
      updatedResponse = {...chat,error:{status:true,message:response?.message},sql:editingSql?.sql,tableData:[]}
    }

    replaceChat(updatedResponse);
    setIsLoading(false)
    setEditingSql({
      isEditing: false,
      sql: editingSql.sql,
      originalSql: editingSql.sql
    });
  };


  const handleSqlKeyDown = (e) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault();
      handleUpdateSql();
    }
  };

  return (
   <div style={{ marginBottom: "16px", width: "90%", }}>
  <div
    style={{
      display: "flex",
      flexWrap: "wrap",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: "#1f2937",
      color: "#f3f4f6",
      padding: "8px 12px",
      borderTopLeftRadius: "6px",
      borderTopRightRadius: "6px",
      gap: "4px",
    }}
  >
    <span
      style={{
        fontSize: "12px",
        fontWeight: "500",
      }}
    >
      Clickhouse Query
    </span>

    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        flexWrap: "wrap",
      }}
    >
      {!editingSql.isEditing && (
        <>
          <button
            onClick={handleEditSql}
            title="Edit SQL query"
            style={{
              display: "flex",
              alignItems: "center",
              color: "#d1d5db",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              transition: "color 0.2s",
            }}
          >
            <Icon className="ti ti-edit" style={{ marginRight: "4px", fontSize: 12 }} />
            <span style={{ fontSize: "12px" }}>Edit</span>
          </button>

          <button
            onClick={() => copyHandler()}
            style={{
              display: "flex",
              alignItems: "center",
              color: "#d1d5db",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              transition: "color 0.2s",
            }}
          >
            {isCopy ? (
              <>
                <Icon className="ti ti-check" style={{ marginRight: "4px", color: "#4ade80", fontSize: 12 }} />
                <span style={{ fontSize: "12px" }}>Copied!</span>
              </>
            ) : (
              <>
                <Icon className="ti ti-copy" style={{ marginRight: "4px", fontSize: 12 }} />
                <span style={{ fontSize: "12px" }}>Copy</span>
              </>
            )}
          </button>
        </>
      )}
    </div>
  </div>

  {editingSql.isEditing ? (
    <div
      style={{
        backgroundColor: "#111827",
        color: "#f3f4f6",
        borderBottomLeftRadius: "6px",
        borderBottomRightRadius: "6px",
        overflow: "hidden",
        width: "100%",
      }}
    >
      <SQLEditorWithLines
        value={editingSql.sql}
        onChange={handleSqlChange}
        onKeyDown={handleSqlKeyDown}
      />

      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          gap: "8px",
          marginTop: "8px",
          padding: "12px",
          backgroundColor: "#1f2937",
          flexWrap: "wrap",
        }}
      >
        <button
          onClick={handleCancelEditSql}
          style={{
            display: "flex",
            alignItems: "center",
            fontSize: "12px",
            color: "#d1d5db",
            padding: "6px 12px",
            borderRadius: "4px",
            border: "1px solid #4b5563",
            background: "transparent",
            cursor: "pointer",
          }}
        >
          <Icon className="ti ti-x" style={{ marginRight: "4px", fontSize: 12 }} />
          Cancel
        </button>

        <button
          onClick={handleUpdateSql}
          disabled={chat.sqlUpdating}
          style={{
            display: "flex",
            alignItems: "center",
            fontSize: "12px",
            backgroundColor: "#5D3FD3",
            color: "#ffffff",
            padding: "6px 12px",
            borderRadius: "4px",
            border: "none",
            cursor: chat.sqlUpdating ? "not-allowed" : "pointer",
            opacity: chat.sqlUpdating ? 0.5 : 1,
          }}
        >
          {isLoading ? (
            <>
              <Icon className="ti ti-loader-2 animate-spin" style={{ marginRight: "4px", fontSize: 12 }} />
              Updating...
            </>
          ) : (
            <>
              <Icon className="ti ti-device-floppy" style={{ marginRight: "4px", fontSize: 12 }} />
              Update
            </>
          )}
        </button>
      </div>

      <div
        style={{
          fontSize: "11px",
          color: "#9ca3af",
          padding: "0 12px 8px",
          backgroundColor: "#1f2937",
        }}
      >
        Tip: Press Ctrl+Enter to quickly update
      </div>
    </div>
  ) : (
    <div
      style={{
        position: "relative",
        width: "100%",
      }}
    >
      <pre
        style={{
          backgroundColor: "#111827",
          color: "#f3f4f6",
          padding: "12px",
          borderBottomLeftRadius: "6px",
          borderBottomRightRadius: "6px",
          overflowX: "auto",
          fontSize: "12px",
          fontFamily: "var(--font-code)",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          margin: 0,
        }}
      >
        <code
          style={{
            display: "block",
            width: "100%",
          }}
        >
          {chat.sql}
        </code>
      </pre>
    </div>
  )}
</div>
  );
};

export default SQLQueryEditorComponent;