module.exports = (d) => {
  const dt = d ? new Date(d) : new Date();
  const year = dt.getFullYear();
  const month =
    dt.getMonth() + 1 < 10 ? `0${dt.getMonth() + 1}` : dt.getMonth() + 1;
  const date = dt.getDate() < 10 ? `0${dt.getDate()}` : dt.getDate();
  return `${year}-${month}-${date}`;
};
