import Icon from "./Icon";

function IconAlert({ type, width, color }) {
  if (
    type?.toLowerCase() === "microsoft teams" ||
    type?.toLowerCase() === "teams"
  ) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={width}
        height={width}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="icon icon-tabler icons-tabler-outline icon-tabler-brand-teams"
      >
        <path stroke="none" d="M0 0h24v24H0z" fill="none" />
        <path d="M3 7h10v10h-10l0 -10" />
        <path d="M6 10h4" />
        <path d="M8 10v4" />
        <path d="M8.104 17c.47 2.274 2.483 4 4.896 4a5 5 0 0 0 5 -5v-7h-5" />
        <path d="M18 18a4 4 0 0 0 4 -4v-5h-4" />
        <path d="M13.003 8.83a3 3 0 1 0 -1.833 -1.833" />
        <path d="M15.83 8.36a2.5 2.5 0 1 0 .594 -4.117" />
      </svg>
    );
  }
  if (type?.toLowerCase() === "slack") {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={width}
        height={width}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="icon icon-tabler icons-tabler-outline icon-tabler-brand-slack"
      >
        <path stroke="none" d="M0 0h24v24H0z" fill="none" />
        <path d="M12 12v-6a2 2 0 0 1 4 0v6m0 -2a2 2 0 1 1 2 2h-6" />
        <path d="M12 12h6a2 2 0 0 1 0 4h-6m2 0a2 2 0 1 1 -2 2v-6" />
        <path d="M12 12v6a2 2 0 0 1 -4 0v-6m0 2a2 2 0 1 1 -2 -2h6" />
        <path d="M12 12h-6a2 2 0 0 1 0 -4h6m-2 0a2 2 0 1 1 2 -2v6" />
      </svg>
    );
  }
  if (
    type?.toLowerCase() === "google chat" ||
    type?.toLowerCase() === "google_chat"
  ) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={width}
        height={width}
        viewBox="0 0 24 24"
        fill={color}
        class="icon icon-tabler icons-tabler-filled icon-tabler-brand-google"
      >
        <path stroke="none" d="M0 0h24v24H0z" fill="none" />
        <path d="M12 2a9.96 9.96 0 0 1 6.29 2.226a1 1 0 0 1 .04 1.52l-1.51 1.362a1 1 0 0 1 -1.265 .06a6 6 0 1 0 2.103 6.836l.001 -.004h-3.66a1 1 0 0 1 -.992 -.883l-.007 -.117v-2a1 1 0 0 1 1 -1h6.945a1 1 0 0 1 .994 .89c.04 .367 .061 .737 .061 1.11c0 5.523 -4.477 10 -10 10s-10 -4.477 -10 -10s4.477 -10 10 -10z" />
      </svg>
    );
  }
  if (
    type?.toLowerCase() === "email (smtp)" ||
    type?.toLowerCase() === "email"
  ) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={width}
        height={width}
        viewBox="0 0 24 24"
        fill={color}
        class="icon icon-tabler icons-tabler-filled icon-tabler-mail"
      >
        <path stroke="none" d="M0 0h24v24H0z" fill="none" />
        <path d="M22 7.535v9.465a3 3 0 0 1 -2.824 2.995l-.176 .005h-14a3 3 0 0 1 -2.995 -2.824l-.005 -.176v-9.465l9.445 6.297l.116 .066a1 1 0 0 0 .878 0l.116 -.066l9.445 -6.297z" />
        <path d="M19 4c1.08 0 2.027 .57 2.555 1.427l-9.555 6.37l-9.555 -6.37a2.999 2.999 0 0 1 2.354 -1.42l.201 -.007h14z" />
      </svg>
    );
  }
  if (type?.toLowerCase() === "pagerduty") {
    return (
      <h5 style={{ color, fontSize: `${width - 6.3}px`, fontWeight: "800" }}>
        PD
      </h5>
    );
  }
  if (type?.toLowerCase() === "node") {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
         width={width}
        height={width}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="icon icon-tabler icons-tabler-outline icon-tabler-file-database"
      >
        <path stroke="none" d="M0 0h24v24H0z" fill="none" />
        <path d="M8 12.75a4 1.75 0 1 0 8 0a4 1.75 0 1 0 -8 0" />
        <path d="M8 12.5v3.75c0 .966 1.79 1.75 4 1.75s4 -.784 4 -1.75v-3.75" />
        <path d="M14 3v4a1 1 0 0 0 1 1h4" />
        <path d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2" />
      </svg>
    );
  }
}

export default IconAlert;
