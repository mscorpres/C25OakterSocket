const { Sequelize } = require("sequelize");

let options = {
	multipleStatements: true,
	pool: {
		max: 100,
		min: 0,
		idle: 10000,
		acquire: 1000000, 
	},
};

const tally = new Sequelize("mscorvik_test_tally", "mscorvik_imsUser", "OWdbJTL3U=?U", {
	host: "119.18.54.131",
	dialect: "mysql",
	dialectOptions: options,
});

const other = new Sequelize("mscorvik_test_other", "mscorvik_imsUser", "OWdbJTL3U=?U", {
	host: "119.18.54.131",
	dialect: "mysql",
	dialectOptions: options,
});

const far = new Sequelize("mscorvik_test_far", "mscorvik_imsUser", "OWdbJTL3U=?U", {
	host: "119.18.54.131",
	dialect: "mysql",
	dialectOptions: options,
});

const invt = new Sequelize("mscorvik_test_ims", "mscorvik_imsUser", "OWdbJTL3U=?U", {
	host: "119.18.54.131",
	dialect: "mysql",
	dialectOptions: options,
});

module.exports = { tallyDB: tally, otherDB: other, farDB: far, invtDB: invt };
