
import { useEffect, useState } from "react";

function useEmptyContainerHeight(initialValue = 900, mainRef) {
  const [memoHeightAppMain, setMemoHeightAppMain] = useState(initialValue);

  useEffect(() => {
    const updateHeight = () => {
      const mainHeight = mainRef?.current?.clientHeight;

      setMemoHeightAppMain(
        mainHeight || window.innerHeight
      );
    };

    updateHeight();

    window.addEventListener("resize", updateHeight);

    return () => {
      window.removeEventListener("resize", updateHeight);
    };
  }, [mainRef]);

  return {
    memoHeightAppMain: memoHeightAppMain - 250,
  };
}

export default useEmptyContainerHeight;
