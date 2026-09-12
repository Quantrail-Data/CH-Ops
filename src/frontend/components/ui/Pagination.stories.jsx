import { useState } from "react";
import Pagination from "./Pagination.jsx";

export default {
  title: "UI/Pagination",
  component: Pagination,
};

export const Default = {
  render: () => {
    const [page, setPage] = useState(1);
    return <Pagination page={page} totalPages={5} onChange={setPage} />;
  },
};

export const ManyPagesWithEllipsis = {
  render: () => {
    const [page, setPage] = useState(6);
    return <Pagination page={page} totalPages={20} onChange={setPage} />;
  },
};

export const SinglePageRendersNothing = {
  render: () => <Pagination page={1} totalPages={1} onChange={() => {}} />,
};
