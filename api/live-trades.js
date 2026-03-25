module.exports = async (req, res) => {
  res.status(200).json({ transactions: [], count: 0 });
};
