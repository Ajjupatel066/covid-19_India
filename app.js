const express = require("express");
const path = require("path");

const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json());

const dbPath = path.join(__dirname, "covid19IndiaPortal.db");
let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3006, () => {
      console.log("Server Running at http://localhost:3006/");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};
initializeDBAndServer();

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "My_Secret_Token");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "My_Secret_Token", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        next();
      }
    });
  }
};

//2. GET list of states API
const convertStateDetailsToPascal = (dbObject) => {
  return {
    stateId: dbObject.state_id,
    stateName: dbObject.state_name,
    population: dbObject.population,
  };
};

app.get("/states/", authenticateToken, async (request, response) => {
  const getStatesQuery = `
    SELECT *
    FROM state
    ORDER BY state_id;`;
  const stateArray = await db.all(getStatesQuery);
  const stateResult = stateArray.map((eachObject) => {
    return convertStateDetailsToPascal(eachObject);
  });
  response.send(stateResult);
});

//3. Returns a state based on the state ID API

const convertDBObjectToResponseObject = (dbObject) => {
  return {
    stateId: dbObject.state_id,
    stateName: dbObject.state_name,
    population: dbObject.population,
  };
};

app.get("/states/:stateId/", authenticateToken, async (request, response) => {
  const { stateId } = request.params;
  const getStateQuery = `
    SELECT *
    FROM state
    WHERE state_id = ${stateId};`;
  const state = await db.get(getStateQuery);
  console.log(stateId);
  response.send(convertDBObjectToResponseObject(state));
});

//4. Create a district in the district table API
app.post("/districts/", authenticateToken, async (request, response) => {
  const createDistrict = request.body;
  const {
    districtName,
    stateId,
    cases,
    cured,
    active,
    deaths,
  } = createDistrict;
  const newDistrict = `
    INSERT INTO
      district (district_name, state_id, cases, cured, active, deaths)
    VALUES
      (
      '${districtName}',
      ${stateId}, 
      ${cases}, 
      ${cured},
      ${active},
      ${deaths});`;
  const addDistrict = await db.run(newDistrict);
  const districtId = addDistrict.lastId;
  response.send("District Successfully Added");
});

//5.Returns a district based on the district ID API
const convertDBObjectResponseObject = (dbObject) => {
  return {
    districtId: dbObject.district_id,
    districtName: dbObject.district_name,
    stateId: dbObject.state_id,
    cases: dbObject.cases,
    cured: dbObject.cured,
    active: dbObject.active,
    deaths: dbObject.deaths,
  };
};

app.get(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const getDistrictQuery = `
    SELECT *
    FROM district
    WHERE district_id = ${districtId};`;
    const district = await db.get(getDistrictQuery);
    console.log(districtId);
    response.send(convertDBObjectResponseObject(district));
  }
);

//6.Delete a district API
app.delete(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const deleteDistrictQuery = `
    DELETE FROM district
    WHERE district_id = ${districtId};`;
    await db.run(deleteDistrictQuery);
    response.send("District Removed");
  }
);

//7. PUT district details API
app.put(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const districtDetails = request.body;
    const {
      districtName,
      stateId,
      cases,
      cured,
      active,
      deaths,
    } = districtDetails;
    const updateDistrictQuery = `
    UPDATE district
    SET district_name= 
        '${districtName}', state_id = ${stateId}, cases = ${cases}, cured = ${cured}, active = ${active}, deaths = ${deaths}
    WHERE district_id = ${districtId};`;
    await db.run(updateDistrictQuery);
    response.send("District Details Updated");
  }
);

//8.GET statistics of total cases, cured, active, deaths of a specific state based on state ID  API
const reportSnakeToCamelCase = (dbObject) => {
  return {
    totalCases: dbObject.cases,
    totalCured: dbObject.cured,
    totalActive: dbObject.active,
    totalDeaths: dbObject.deaths,
  };
};

app.get(
  "/states/:stateId/stats/",
  authenticateToken,
  async (request, response) => {
    const { stateId } = request.params;
    const getStateReport = `
        SELECT SUM(cases) AS cases,
            SUM(cured) AS cured,
            SUM(active) AS active,
            SUM(deaths) AS deaths
        FROM district
        WHERE state_id = ${stateId};`;
    const stateReport = await db.get(getStateReport);
    const resultReport = reportSnakeToCamelCase(stateReport);
    response.send(resultReport);
  }
);

module.exports = app;
