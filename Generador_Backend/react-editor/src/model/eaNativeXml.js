// Exporta/importa el diagrama en formato "EA Native XML" — el que usa
// Enterprise Architect internamente (el mismo que exporta "Export Package
// to Native XML" en EA 17). NO es XMI: es un dump de las tablas de EA
// (t_package, t_object, t_attribute, t_connector, t_diagram, t_diagramobjects).
//
// CONVENCIÓN CLAVE (la que hace que EA lo importe bien):
//   - Los paquetes viven en t_package (NO en t_object).
//   - t_object.Package_ID apunta al Package_ID de t_package (no a un Object_ID).
//   - t_attribute.Object_ID y t_connector.Start/End_Object_ID apuntan al
//     Object_ID numérico de t_object.
//   - Cada fila de t_object/t_attribute/t_connector/t_diagramobjects/
//     t_diagramlinks lleva <Extension .../> al final con el GUID del padre.
//
// El importador es 100% determinístico (no usa IA) y devuelve el mismo
// contrato { message, operations } que draw.io / IA / imagen, para reusar
// applyOperations() del editor.

// --- Mapeo de tipos editor -> EA -----------------------------------------
const TYPE_TO_EA = {
  UUID: "String",
  String: "String",
  Integer: "int",
  Long: "long",
  Double: "double",
  Boolean: "boolean",
  Date: "Date",
  DateTime: "DateTime",
};

const TYPE_FROM_EA = {
  string: "String",
  int: "Integer",
  integer: "Integer",
  long: "Long",
  double: "Double",
  float: "Double",
  boolean: "Boolean",
  bool: "Boolean",
  date: "Date",
  datetime: "DateTime",
  uuid: "UUID",
};

// --- Helpers --------------------------------------------------------------

function escapeXml(str) {
  return String(str ?? "").replace(/[<>&"']/g, (c) => ({
    "<": "&lt;",
    ">": "&gt;",
    "&": "&amp;",
    '"': "&quot;",
    "'": "&apos;",
  }[c]));
}

function newGuid() {
  const hex = (n) => Math.floor(Math.random() * 16 ** n).toString(16).padStart(n, "0");
  const g = `${hex(8)}-${hex(4)}-${hex(4)}-${hex(4)}-${hex(12)}`.toUpperCase();
  return `{${g}}`;
}

// GUID determinístico a partir del id del editor.
function stableGuid(id) {
  const s = String(id ?? "");
  if (/^\{[0-9A-F-]{36}\}$/i.test(s)) return s.toUpperCase();
  let h1 = 0x811c9dc5, h2 = 0x01000193, h3 = 0x9e3779b9, h4 = 0x85ebca6b;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = (h1 ^ c) * 16777619 >>> 0;
    h2 = (h2 + c * 31) >>> 0;
    h3 = (h3 ^ (c << 5)) >>> 0;
    h4 = (h4 * 33 + c) >>> 0;
  }
  const hex = (n) => (n >>> 0).toString(16).padStart(8, "0");
  const raw = hex(h1) + hex(h2) + hex(h3) + hex(h4);
  const g = `${raw.slice(0,8)}-${raw.slice(8,12)}-${raw.slice(12,16)}-${raw.slice(16,20)}-${raw.slice(20,32)}`.toUpperCase();
  return `{${g}}`;
}

// Fila SIN <Extension> (para t_package).
const EA_ROW = (cols) =>
  `\t\t<Row>\n${cols
    .map(([n, v]) => `\t\t\t<Column name="${n}" value="${escapeXml(v)}"/>`)
    .join("\n")}\n\t\t</Row>`;

// Fila CON <Extension .../> (para todo el resto).
const EA_ROW_WITH_EXT = (cols, extAttrs) => {
  const colsXml = cols
    .map(([n, v]) => `\t\t\t<Column name="${n}" value="${escapeXml(v)}"/>`)
    .join("\n");
  const extXml = Object.entries(extAttrs || {})
    .map(([k, v]) => `${k}="${escapeXml(v)}"`)
    .join(" ");
  return `\t\t<Row>\n${colsXml}\n\t\t\t<Extension${extXml ? " " + extXml : ""}/>\n\t\t</Row>`;
};

const EA_TABLE = (name, rows) =>
  `\t<Table name="${name}">\n${rows.join("\n")}\n\t</Table>`;

function nowSql() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// --- Export ----------------------------------------------------------------

export function buildEaNativeXml(diagram) {
  const projectName = diagram.projectName || "Modelo";
  const basePackage = diagram.basePackage || "com.modelo";
  const entities = diagram.entities || [];
  const relationships = diagram.relationships || [];

  // IDs internos (convención EA)
  const ROOT_PKG_ID = 1;       // fila de t_package para el proyecto
  const BASE_PKG_ID = 2;       // fila de t_package para el basePackage Java
  const FIRST_OBJ_ID = 100;    // primer Object_ID de clase
  const FIRST_CONN_ID = 300;   // primer Connector_ID
  const DIAGRAM_ID = 1;

  const projectPkgGuid = newGuid();
  const basePkgGuid = newGuid();
  const diagramGuid = newGuid();

  // Mapa entityId -> { objectId, guid }
  const entityMeta = {};
  entities.forEach((e, i) => {
    entityMeta[e.id] = {
      objectId: String(FIRST_OBJ_ID + i),
      guid: stableGuid(e.id),
      tpos: i,
    };
  });

  // --- t_package -----------------------------------------------------------
  // DOS filas: el proyecto raíz y el sub-paquete con el basePackage.
  const pkgRows = [
    EA_ROW([
      ["Package_ID", String(ROOT_PKG_ID)],
      ["Name", projectName],
      ["Parent_ID", "0"],
      ["CreatedDate", nowSql()],
      ["ModifiedDate", nowSql()],
      ["ea_guid", projectPkgGuid],
      ["IsControlled", "0"],
      ["LastLoadDate", nowSql()],
      ["LastSaveDate", nowSql()],
      ["Version", "1.0"],
      ["Protected", "0"],
      ["UseDTD", "0"],
      ["LogXML", "0"],
      ["TPos", "1"],
      ["PackageFlags", "CRC=0;"],
      ["BatchSave", "0"],
      ["BatchLoad", "0"],
    ]),
    EA_ROW([
      ["Package_ID", String(BASE_PKG_ID)],
      ["Name", basePackage],
      ["Parent_ID", String(ROOT_PKG_ID)],
      ["CreatedDate", nowSql()],
      ["ModifiedDate", nowSql()],
      ["ea_guid", basePkgGuid],
      ["IsControlled", "0"],
      ["LastLoadDate", nowSql()],
      ["LastSaveDate", nowSql()],
      ["Version", "1.0"],
      ["Protected", "0"],
      ["UseDTD", "0"],
      ["LogXML", "0"],
      ["TPos", "1"],
      ["PackageFlags", "CRC=0;"],
      ["BatchSave", "0"],
      ["BatchLoad", "0"],
    ]),
  ];

  // --- t_object ------------------------------------------------------------
  // SOLO clases. Los paquetes ya viven en t_package.
  // Package_ID apunta al Package_ID de t_package (BASE_PKG_ID).
  const objectRows = entities.map((entity) => {
    const meta = entityMeta[entity.id];
    return EA_ROW_WITH_EXT(
      [
        ["Object_ID", meta.objectId],
        ["Object_Type", "Class"],
        ["Diagram_ID", String(DIAGRAM_ID)],
        ["Name", entity.name],
        ["Author", ""],
        ["Version", "1.0"],
        ["Package_ID", String(BASE_PKG_ID)],
        ["NType", "0"],
        ["Complexity", "1"],
        ["Effort", "0"],
        ["Backcolor", "-1"],
        ["BorderStyle", "0"],
        ["BorderWidth", "-1"],
        ["Fontcolor", "-1"],
        ["Bordercolor", "-1"],
        ["CreatedDate", nowSql()],
        ["ModifiedDate", nowSql()],
        ["Status", "Proposed"],
        ["Abstract", "0"],
        ["Tagged", "0"],
        ["PDATA2", "<none>"],
        ["PDATA4", "0"],
        ["GenType", "<none>"],
        ["Phase", "1.0"],
        ["Scope", "Public"],
        ["Classifier", "0"],
        ["ea_guid", meta.guid],
        ["ParentID", "0"],
        ["TPos", String(meta.tpos)],
        ["IsRoot", "0"],
        ["IsLeaf", "0"],
        ["IsSpec", "0"],
        ["IsActive", "0"],
      ],
      { Package_ID: basePkgGuid }
    );
  });

  // --- t_attribute ---------------------------------------------------------
  // Object_ID = Object_ID numérico de la clase (100, 101, ...).
  const attrRows = [];
  let attrId = 1;
  entities.forEach((entity) => {
    const meta = entityMeta[entity.id];
    (entity.attributes || []).forEach((attr, pos) => {
      attrRows.push(EA_ROW_WITH_EXT(
        [
          ["Object_ID", meta.objectId],
          ["Name", attr.name],
          ["Scope", attr.isPrimaryKey ? "Public" : "Private"],
          ["Containment", "Not Specified"],
          ["IsStatic", "0"],
          ["IsCollection", "0"],
          ["IsOrdered", "0"],
          ["AllowDuplicates", "0"],
          ["LowerBound", attr.nullable === false ? "1" : "0"],
          ["UpperBound", "1"],
          ["ID", String(attrId)],
          ["Pos", String(pos)],
          ["Classifier", "0"],
          ["Type", TYPE_TO_EA[attr.type] || "String"],
          ["ea_guid", stableGuid(attr.id)],
          ["StyleEx", "volatile=0;"],
        ],
        { Object_ID: meta.guid }
      ));
      attrId++;
    });
  });

  // --- t_connector ---------------------------------------------------------
  // Start/End_Object_ID = Object_ID numérico de la clase.
  const connRows = [];
  relationships.forEach((rel, i) => {
    const fromMeta = entityMeta[rel.from];
    const toMeta = entityMeta[rel.to];
    if (!fromMeta || !toMeta) return;

    connRows.push(EA_ROW_WITH_EXT(
      [
        ["Connector_ID", String(FIRST_CONN_ID + i)],
        ["Direction", "Unspecified"],
        ["Connector_Type", "Association"],
        ["SourceAccess", "Public"],
        ["DestAccess", "Public"],
        ["SourceContainment", "Unspecified"],
        ["SourceIsAggregate", "0"],
        ["SourceIsOrdered", "0"],
        ["DestContainment", "Unspecified"],
        ["DestIsAggregate", "0"],
        ["DestIsOrdered", "0"],
        ["Start_Object_ID", fromMeta.objectId],
        ["End_Object_ID", toMeta.objectId],
        ["Start_Edge", "2"],
        ["End_Edge", "4"],
        ["PtStartX", "0"],
        ["PtStartY", "0"],
        ["PtEndX", "0"],
        ["PtEndY", "0"],
        ["SeqNo", "0"],
        ["HeadStyle", "0"],
        ["LineStyle", "0"],
        ["RouteStyle", "3"],
        ["IsBold", "0"],
        ["LineColor", "-1"],
        ["VirtualInheritance", "0"],
        ["PDATA5", "SX=0;SY=0;EX=0;EY=0;SCME=0;SCTR=0;"],
        ["DiagramID", String(DIAGRAM_ID)],
        ["ea_guid", stableGuid(rel.id)],
        ["SourceIsNavigable", "0"],
        ["DestIsNavigable", "0"],
        ["IsRoot", "0"],
        ["IsLeaf", "0"],
        ["SourceChangeable", "none"],
        ["DestChangeable", "none"],
        ["SourceTS", "instance"],
        ["DestTS", "instance"],
        ["Target2", "0"],
        ["SourceStyle", "Union=0;Derived=0;AllowDuplicates=0;Owned=0;Navigable=Unspecified;"],
        ["DestStyle", "Union=0;Derived=0;AllowDuplicates=0;Owned=0;Navigable=Unspecified;"],
        ["Name", rel.fromRole || ""],
        ["DestRole", rel.toRole || ""],
      ],
      { Start_Object_ID: fromMeta.guid, End_Object_ID: toMeta.guid }
    ));
  });

  // --- t_diagram -----------------------------------------------------------
  // Package_ID = BASE_PKG_ID (el diagrama cuelga del sub-paquete).
  const diagramRow = EA_ROW_WITH_EXT(
    [
      ["Diagram_ID", String(DIAGRAM_ID)],
      ["Package_ID", String(BASE_PKG_ID)],
      ["ParentID", "0"],
      ["Diagram_Type", "Logical"],
      ["Name", projectName],
      ["Version", "1.0"],
      ["Author", ""],
      ["ShowDetails", "0"],
      ["AttPub", "1"],
      ["AttPri", "1"],
      ["AttPro", "1"],
      ["Orientation", "P"],
      ["cx", "826"],
      ["cy", "1169"],
      ["Scale", "100"],
      ["CreatedDate", nowSql()],
      ["ModifiedDate", nowSql()],
      ["ShowForeign", "1"],
      ["ShowBorder", "1"],
      ["ShowPackageContents", "1"],
      ["PDATA", "HideRel=0;ShowTags=0;ShowReqs=0;ShowCons=0;OpParams=1;ShowSN=0;ShowIcons=1;HideProps=0;HideAtts=0;HideOps=0;HideStereo=0;ShowRec=1;ShowShape=1;"],
      ["Locked", "0"],
      ["ea_guid", diagramGuid],
      ["StyleEx", "ExcludeRTF=0;DocAll=0;HideQuals=0;AttPkg=1;ShowTests=0;ShowMaint=0;SuppressFOC=1;TConnectorNotation=UML 2.1;"],
    ],
    { Package_ID: basePkgGuid }
  );

  // --- t_diagramobjects ----------------------------------------------------
  // Object_ID = Object_ID numérico de la clase.
  const diagObjRows = entities.map((entity, i) => {
    const meta = entityMeta[entity.id];
    const x = Math.round(entity.position?.x ?? 0);
    const y = Math.round(entity.position?.y ?? 0);
    const w = 117;
    const h = 71;
    return EA_ROW_WITH_EXT(
      [
        ["Diagram_ID", String(DIAGRAM_ID)],
        ["Object_ID", meta.objectId],
        ["RectTop", String(-y)],
        ["RectLeft", String(x)],
        ["RectRight", String(x + w)],
        ["RectBottom", String(-(y + h))],
        ["Sequence", String(i + 1)],
        ["ObjectStyle", "ImageID=0;"],
        ["Instance_ID", String(i + 1)],
      ],
      { Diagram_ID: diagramGuid, Object_ID: meta.guid }
    );
  });

  // --- t_diagramlinks ------------------------------------------------------
  const diagLinkRows = relationships
    .map((rel, i) => {
      const fromMeta = entityMeta[rel.from];
      if (!fromMeta) return null;
      return EA_ROW_WITH_EXT(
        [
          ["DiagramID", String(DIAGRAM_ID)],
          ["ConnectorID", String(FIRST_CONN_ID + i)],
          ["Geometry", "SX=0;SY=0;EX=0;EY=0;SCME=0;SCTR=0;EDGE=2;$LLB=;LLT=;LMT=;LMB=;LRT=;LRB=;IRHS=;ILHS=;"],
          ["Style", "Mode=3;Color=-1;LWidth=0;"],
          ["Hidden", "0"],
          ["Instance_ID", String(FIRST_CONN_ID + i)],
        ],
        { DiagramID: diagramGuid, ConnectorID: stableGuid(rel.id) }
      );
    })
    .filter(Boolean);

  // --- Armar el XML --------------------------------------------------------
  const parts = [];
  parts.push('<?xml version="1.0" encoding="windows-1252" standalone="no" ?>');
  parts.push(`<Package name="${escapeXml(projectName)}" guid="${projectPkgGuid}">`);
  parts.push(EA_TABLE("t_package", pkgRows));
  parts.push(EA_TABLE("t_object", objectRows));
  parts.push(EA_TABLE("t_attribute", attrRows));
  parts.push(EA_TABLE("t_connector", connRows));
  parts.push(EA_TABLE("t_diagram", [diagramRow]));
  parts.push(EA_TABLE("t_diagramobjects", diagObjRows));
  parts.push(EA_TABLE("t_diagramlinks", diagLinkRows));
  parts.push("</Package>");

  return parts.join("\n");
}

// --- Import ----------------------------------------------------------------

export function parseEaNativeXml(xmlString) {
  const doc = new DOMParser().parseFromString(xmlString, "text/xml");
  if (doc.querySelector("parsererror")) {
    return { message: "El archivo no es un XML válido.", operations: [] };
  }

  const root = doc.documentElement;
  if (root.nodeName !== "Package") {
    return { message: "El archivo no parece ser un XML nativo de Enterprise Architect (falta <Package>).", operations: [] };
  }

  const tables = {};
  root.querySelectorAll(":scope > Table").forEach((t) => {
    tables[t.getAttribute("name")] = t;
  });

  if (!tables.t_object) {
    return { message: "El XML no tiene tabla t_object: no parece un export nativo de EA.", operations: [] };
  }

  const operations = [];
  const guidToClass = {};
  const idToGuid = {};

  Array.from(tables.t_object.querySelectorAll(":scope > Row")).forEach((row) => {
    const col = colsOf(row);
    if (col["Object_Type"] !== "Class") return;
    const guid = col["ea_guid"];
    if (!guid) return;
    idToGuid[col["Object_ID"]] = guid;
    guidToClass[guid] = col["Name"] || "ClaseSinNombre";
    operations.push({ type: "ADD_ENTITY", name: col["Name"] || "ClaseSinNombre" });
  });

  if (tables.t_attribute) {
    const attrRows = Array.from(tables.t_attribute.querySelectorAll(":scope > Row"));
    attrRows.sort((a, b) => {
      const ca = colsOf(a), cb = colsOf(b);
      const oa = ca["Object_ID"] || "", ob = cb["Object_ID"] || "";
      if (oa !== ob) return oa < ob ? -1 : 1;
      return Number(ca["Pos"] || 0) - Number(cb["Pos"] || 0);
    });

    attrRows.forEach((row) => {
      const col = colsOf(row);
      const ownerKey = col["Object_ID"];
      const ownerGuid = idToGuid[ownerKey] || ownerKey;
      const entityName = guidToClass[ownerGuid];
      if (!entityName) return;
      const rawType = (col["Type"] || "String").trim();
      const editorType = TYPE_FROM_EA[rawType.toLowerCase()] || "String";
      const isPrimaryKey = (col["Scope"] || "").toLowerCase() === "public" && (col["Name"] || "").toLowerCase() === "id";
      const nullable = (col["LowerBound"] || "1") === "0";
      operations.push({
        type: "ADD_ATTRIBUTE",
        entityName,
        name: col["Name"] || "campo",
        dataType: editorType,
        isPrimaryKey,
        nullable,
      });
    });
  }

  if (tables.t_connector) {
    Array.from(tables.t_connector.querySelectorAll(":scope > Row")).forEach((row) => {
      const col = colsOf(row);
      const startGuid = idToGuid[col["Start_Object_ID"]] || col["Start_Object_ID"];
      const endGuid = idToGuid[col["End_Object_ID"]] || col["End_Object_ID"];
      const fromEntity = guidToClass[startGuid];
      const toEntity = guidToClass[endGuid];
      if (!fromEntity || !toEntity) return;
      operations.push({
        type: "ADD_RELATIONSHIP",
        fromEntity,
        toEntity,
        relType: "ONE_TO_MANY",
        fromRole: col["Name"] || "items",
        toRole: col["DestRole"] || "padre",
      });
    });
  }

  const positions = {};
  if (tables.t_diagramobjects) {
    Array.from(tables.t_diagramobjects.querySelectorAll(":scope > Row")).forEach((row) => {
      const col = colsOf(row);
      const objId = col["Object_ID"];
      const guid = idToGuid[objId] || objId;
      const entityName = guidToClass[guid];
      if (!entityName) return;
      const x = Number(col["RectLeft"] || 0);
      const y = -Number(col["RectTop"] || 0);
      positions[entityName] = { x, y };
    });
  }

  const nEnt = Object.keys(guidToClass).length;
  const nRel = operations.filter((o) => o.type === "ADD_RELATIONSHIP").length;
  const nAttr = operations.filter((o) => o.type === "ADD_ATTRIBUTE").length;

  return {
    message: `Importé ${nEnt} clase(s), ${nAttr} atributo(s) y ${nRel} relación(es) desde EA Native XML.`,
    operations,
    positions,
  };
}

function colsOf(row) {
  const out = {};
  row.querySelectorAll(":scope > Column").forEach((c) => {
    out[c.getAttribute("name")] = c.getAttribute("value");
  });
  return out;
}

// --- Detección de formato --------------------------------------------------

export function detectFormat(xmlString) {
  const s = xmlString.slice(0, 4000);
  if (/<mxfile[\s>]|<mxGraphModel[\s>]/.test(s)) return "drawio";
  if (/<Table name="t_object"/.test(xmlString)) return "ea-native";
  if (/<XMI[\s>]/.test(s) && /Enterprise Architect/i.test(s)) return "ea-xmi";
  if (/<XMI[\s>]/.test(s)) return "ea-xmi";
  if (/<definitions[\s>].*bpmn/i.test(s) || /<bpmn:definitions/.test(s)) return "bpmn";
  return "unknown";
}