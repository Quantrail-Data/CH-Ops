// AlertBanner - Temporary notification banner with success/error states
//
// A floating alert component that slides in to show
// the result of user actions like saves, updates, or deletions. It displays
// either a success (green) or error (red) message with a close button.
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail™ Data Private Limited

import {AnimatePresence,motion} from 'motion/react';
import { Notice } from "../ui/index.jsx";

// Alertbanner component for alert banner pop for showing the result or response to the user
function AlertBanner({result,setResult}) {

    return (
    <AnimatePresence>
         {/* custom component for alert banner so we can re-use this */}
        {result && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            style={{ marginBottom: 14 }}
          >
            <Notice
              tone={result.ok ? "success" : "danger"}
              icon={result.ok ? "ti-check" : "ti-alert-circle"}
              onDismiss={() => setResult(null)}
            >
              {result.msg}
            </Notice>
          </motion.div>
        )}
    </AnimatePresence>
  )
}

export default AlertBanner
