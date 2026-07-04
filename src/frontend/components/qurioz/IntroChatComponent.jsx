// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> Praveen kumar
// Renders the initial welcome screen, suggested prompts, and onboarding guidance for new chat sessions.

import { motion } from "motion/react";
import Icon from "../common/Icon.jsx";
import ChatInputComponent from "./ChatInputComponent";


function IntroChatComponent({inputSubmitHandler,isSendDisabled}) {
  const introInfo = [
    { id: 1, title: "Query Generation", icon: "ti-database",bg:"#ffd182",color:"#623e00ff" },
    { id: 2, title: "Chart Visualization", icon: "ti-chart-histogram",bg:"#cde7fe",color:"#006ece" },
    { id: 3, title: "Data-table based on the query", icon: "ti-table-row",bg:"#cae592",color:"#496d01ff" },
    { id: 4, title: "Download Chart/Table", icon: "ti-download",bg:"#ffcee4ff",color:"#bc0051" },
];

  return (
    <div className="intro-container" id="intro-search-control">
        {/* <motion.div
          initial={{ opacity: 0.5, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.7 }}
        //   className="db-chat-title"
        >
            <img src={QuriozImage} style={{width:"150px"}} />
        </motion.div> */}
      <div className="intro-image-continer">
        <motion.div
          initial={{ opacity: 0.5, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.7 }}
          className="db-chat-title"
        >
          <h2 className="hi-title">
            <span>Welcome to</span> QURIOZ
          </h2>
          <p
            style={{
              display: "flex",
              alignItems: "center",
              gap: "5px",
              fontSize: "13px",
            }}
          >
            Choose a database from the dropdown above to begin your conversation
            with Qurioz
          </p>
        </motion.div>

        <div style={{
            display:'grid',
            gridTemplateColumns:`repeat(2 ,1fr) `,
            gap:"10px",
            margin:"20px 0px"
        }}>
            {introInfo?.map((info,indx) => (<motion.div 
            initial={{opacity:0,scale:0.7}}
            animate={{opacity:1,scale:1}}
            transition={{duration:0.3}}
            className="intro-feat"
            key={indx} >
                <div style={{backgroundColor:`${info?.bg}`}}>
                    <Icon className={`ti ${info?.icon}`} style={{color:`${info?.color}`}}></Icon>
                </div>
                <span>{info?.title}</span>
            </motion.div>))}
        </div>
      </div>
      <ChatInputComponent stage={"inital"} onSubmit={inputSubmitHandler} isSendDisabled={isSendDisabled}/>
    </div>
  );
}

export default IntroChatComponent;
