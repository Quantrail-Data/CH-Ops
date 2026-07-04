// AlertBanner - Temporary notification banner with success/error states
//
// A floating alert component that slides in to show
// the result of user actions like saves, updates, or deletions. It displays
// either a success (green) or error (red) message with a close button.
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail™ Data Private Limited

import React from 'react'
import Icon from "../common/Icon.jsx";
import {AnimatePresence,motion} from 'motion/react';

// Alertbanner component for alert banner pop for showing the result or response to the user
function AlertBanner({result,setResult}) {

    return (
    <AnimatePresence>
         {/* custom component for alert banner so we can re-use this */}
        {result && <motion.div 
        initial={{opacity:0,y:10}}
        animate={{opacity:1,y:0}}
        exit={{opacity:0,y:10}}
        className={`alert-banner ${result.ok ? 'success' : 'danger'}`} style={{ marginBottom: 14 }}>
          <Icon className={`ti ${result.ok ? 'ti-check' : 'ti-alert-circle'}`}>
          </Icon> {result.msg}
          <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setResult(null)}>
            <Icon className="ti ti-x"></Icon>
          </button>
        </motion.div>}
    </AnimatePresence>
  )
}

export default AlertBanner
