import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import Icon from "../common/Icon";

function HistoryShowBubbleComponent({ chatSession }) {
  const [isOpen, setIsOpen] = useState(true);
  const [chats, setChats] = useState(chatSession || []);
  const [openMenuId, setOpenMenuId] = useState(null);
  const [editingChatId, setEditingChatId] = useState(null);
  const [title, setTitle] = useState("");
  const [menuPosition, setMenuPosition] = useState(null);
  const menuRef = useRef(null);

  useEffect(() => setChats(chatSession || []), [chatSession]);

  useEffect(() => {
    if (openMenuId === null) return undefined;
    const closeMenu = (event) => {
      if (!menuRef.current?.contains(event.target)) setOpenMenuId(null);
    };
    document.addEventListener("mousedown", closeMenu);
    return () => document.removeEventListener("mousedown", closeMenu);
  }, [openMenuId]);

  const isNewSession = chats.length === 0;

  function startEditing(chat) {
    setTitle(chat.title || "");
    setEditingChatId(chat.id);
    setOpenMenuId(null);
    setMenuPosition(null);
  }

  function saveTitle(chatId) {
    const nextTitle = title.trim();
    if (nextTitle) {
      setChats((currentChats) =>
        currentChats.map((chat) =>
          chat.id === chatId ? { ...chat, title: nextTitle } : chat,
        ),
      );
    }
    setEditingChatId(null);
  }

  function deleteChat(chatId) {
    setChats((currentChats) =>
      currentChats.filter((chat) => chat.id !== chatId),
    );
    setOpenMenuId(null);
    setMenuPosition(null);
  }

  return (
    <AnimatePresence>
      {!isOpen && (
        <motion.div
          style={{
            position: "absolute",
            top: "0rem",
          }}
          title="History"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5, ease: "easeInOut" }}
        >
          <button className="btn btn-ghost" onClick={() => setIsOpen(!isOpen)}>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              class="icon icon-tabler icons-tabler-outline icon-tabler-history-toggle"
            >
              <path stroke="none" d="M0 0h24v24H0z" fill="none" />
              <path d="M10 20.777a8.942 8.942 0 0 1 -2.48 -.969" />
              <path d="M14 3.223a9.003 9.003 0 0 1 0 17.554" />
              <path d="M4.579 17.093a8.961 8.961 0 0 1 -1.227 -2.592" />
              <path d="M3.124 10.5c.16 -.95 .468 -1.85 .9 -2.675l.169 -.305" />
              <path d="M6.907 4.579a8.954 8.954 0 0 1 3.093 -1.356" />
              <path d="M12 8v4l3 3" />
            </svg>
          </button>
        </motion.div>
      )}
      {isOpen && (
        <motion.div
          style={{
            position: "absolute",
            border: "1px solid var(--border-default)",
            top: "0rem",
            borderRadius: "10px",
            padding: "10px",
            backgroundColor: "var(--bg-page)",
            // overflowY:"scroll"
          }}
          initial={{ opacity: 0, width: "0rem", height: "0vh" }}
          animate={{
            opacity: 1,
            width: "20rem",
            height: "70vh",
          }}
          exit={{ opacity: 0 }}
        >
          <div className="header-history">
            <button
              className="btn btn-ghost"
              onClick={() => setIsOpen(!isOpen)}
            >
              <Icon className="ti ti-chevron-left" />
            </button>
            <button className="btn btn-ghost">
              <Icon className="ti ti-plus" />
              New Chat
            </button>
          </div>

          <div className="chat-sesion-body">
            {isNewSession ? (
              <div>
                <span>New chat</span>
              </div>
            ) : (
              chats.map((chat) => {
                return (
                  <div className="chat-session-tab" key={chat.id}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {editingChatId === chat.id ? (
                        <input
                          autoFocus
                          className="form-input"
                          style={{
                            width: "100%",
                            height: "24px",
                            minHeight: 0,
                            padding: "2px 6px",
                            boxSizing: "border-box",
                            fontSize: "13px",
                            lineHeight: "18px",
                          }}
                          value={title}
                          onChange={(event) => setTitle(event.target.value)}
                          onBlur={() => saveTitle(chat.id)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") event.currentTarget.blur();
                          }}
                        />
                      ) : (
                        <span>{chat?.title}</span>
                      )}
                    </div>
                    <div style={{ flexShrink: 0 }}>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        title="More options"
                        aria-label={`More options for ${chat.title}`}
                        aria-expanded={openMenuId === chat.id}
                        onClick={(event) => {
                          if (openMenuId === chat.id) {
                            setOpenMenuId(null);
                            setMenuPosition(null);
                            return;
                          }
                          const bounds = event.currentTarget.getBoundingClientRect();
                          setMenuPosition({
                            left: Math.min(Math.max(8, bounds.right - 128), window.innerWidth - 136),
                            top: window.innerHeight - bounds.bottom < 96 ? bounds.top - 88 : bounds.bottom + 4,
                          });
                          setOpenMenuId(chat.id);
                        }}
                      >
                        <svg
                          width="20"
                          height="20"
                          fill="#fff"
                          viewBox="0 0 24 24"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path d="M12 10a2 2 0 1 0 2 2 2 2 0 0 0-2-2m-7 0a2 2 0 1 0 2 2 2 2 0 0 0-2-2m14 0a2 2 0 1 0 2 2 2 2 0 0 0-2-2" />
                        </svg>
                      </button>
                      {openMenuId === chat.id && menuPosition && createPortal(
                        <ul
                          ref={menuRef}
                          className="cui-select-menu"
                          style={{
                            position: "fixed",
                            left: menuPosition.left,
                            top: menuPosition.top,
                            zIndex: 4000,
                            minWidth: "120px",
                            overflow: "hidden",
                          }}
                        >
                          <li
                            className="cui-select-opt"
                            onClick={() => startEditing(chat)}
                          >
                            <Icon className="ti ti-edit" /> <span>Edit</span>
                          </li>

                          <li
                            className="cui-select-opt"
                            onClick={() => deleteChat(chat.id)}
                            style={{ color: "var(--color-danger, #e5484d)" }}
                          >
                            <Icon className="ti ti-trash" /> <span>Delete</span>
                          </li>
                        </ul>
                        , document.body
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default HistoryShowBubbleComponent;
