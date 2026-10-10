// Exporta/importa el diagrama en el formato XML que usa draw.io (diagrams.net),
// usando su shape nativa de "tabla" (la misma que usa su plantilla de ER),
// para que al abrirlo se vea como una tabla real editable, no un cuadro de texto.
//
// El importador es 100% determinístico (no usa IA): draw.io es un formato
// estructurado, así que alcanza con leer su XML. Devuelve el mismo contrato
// { message, operations } que usan el asistente de texto y el de imagen,
// para reusar la misma función applyOperations() del editor.

const ROW_HEIGHT = 30;
const HEADER_HEIGHT = 30;
const NAME_COL_WIDTH = 130;
const TYPE_COL_WIDTH = 90;
const TABLE_WIDTH = NAME_COL_WIDTH + TYPE_COL_WIDTH;

function escapeXml(str) {
  return String(str).replace(/[<>&"']/g, (c) => ({
    "<": "&lt;",
    ">": "&gt;",
    "&": "&amp;",
    '"': "&quot;",
    "'": "&apos;",
  }[c]));
}

function attributeLabel(attr) {
  const marker = attr.isPrimaryKey ? "🔑 " : attr.unique ? "◆ " : "";
  return `${marker}${attr.name}`;
}

export function buildDrawioXml(diagram) {
  const cells = ['<mxCell id="0" />', '<mxCell id="1" parent="0" />'];

  diagram.entities.forEach((entity, index) => {
    const tableId = `table_${entity.id}`;
    const x = entity.position?.x ?? (index % 3) * 260;
    const y = entity.position?.y ?? Math.floor(index / 3) * 220;
    const totalHeight = HEADER_HEIGHT + entity.attributes.length * ROW_HEIGHT;

    cells.push(
      `<mxCell id="${tableId}" value="${escapeXml(entity.name)}" ` +
        `style="shape=table;startSize=${HEADER_HEIGHT};container=1;collapsible=0;childLayout=tableLayout;fillColor=#dae8fc;strokeColor=#6c8ebf;" ` +
        `vertex="1" parent="1">` +
        `<mxGeometry x="${x}" y="${y}" width="${TABLE_WIDTH}" height="${totalHeight}" as="geometry" /></mxCell>`
    );

    entity.attributes.forEach((attr, attrIndex) => {
      const rowId = `row_${entity.id}_${attr.id}`;
      const rowY = HEADER_HEIGHT + attrIndex * ROW_HEIGHT;

      cells.push(
        `<mxCell id="${rowId}" value="" ` +
          `style="shape=tableRow;horizontal=0;startSize=0;swimlaneHead=0;swimlaneBody=0;fillColor=none;collapsible=0;dropTarget=0;points=[[0,0.5],[1,0.5]];portConstraint=eastwest;top=0;left=0;right=0;bottom=0;" ` +
          `vertex="1" parent="${tableId}">` +
          `<mxGeometry y="${rowY}" width="${TABLE_WIDTH}" height="${ROW_HEIGHT}" as="geometry" /></mxCell>`
      );

      cells.push(
        `<mxCell id="${rowId}_name" value="${escapeXml(attributeLabel(attr))}" ` +
          `style="shape=partialRectangle;html=1;whiteSpace=wrap;connectable=0;strokeColor=inherit;overflow=hidden;fillColor=none;top=0;left=0;bottom=0;right=0;pointerEvents=1;fontSize=11;" ` +
          `vertex="1" parent="${rowId}">` +
          `<mxGeometry width="${NAME_COL_WIDTH}" height="${ROW_HEIGHT}" as="geometry" /></mxCell>`
      );

      cells.push(
        `<mxCell id="${rowId}_type" value="${escapeXml(attr.type)}" ` +
          `style="shape=partialRectangle;html=1;whiteSpace=wrap;connectable=0;strokeColor=inherit;overflow=hidden;fillColor=none;top=0;left=0;bottom=0;right=0;pointerEvents=1;fontSize=11;fontColor=#666666;" ` +
          `vertex="1" parent="${rowId}">` +
          `<mxGeometry x="${NAME_COL_WIDTH}" width="${TYPE_COL_WIDTH}" height="${ROW_HEIGHT}" as="geometry" /></mxCell>`
      );
    });
  });

  diagram.relationships.forEach((rel) => {
    const label = `${rel.fromRole || ""} / ${rel.toRole || ""}`;
    cells.push(
      `<mxCell id="${rel.id}" value="${escapeXml(label)}" ` +
        `style="edgeStyle=entityRelationEdgeStyle;fontSize=10;html=1;endArrow=ERmany;startArrow=ERone;rounded=0;" ` +
        `edge="1" parent="1" source="table_${rel.from}" target="table_${rel.to}">` +
        `<mxGeometry relative="1" as="geometry" /></mxCell>`
    );
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<mxfile host="app.diagrams.net">
  <diagram name="Diagrama" id="diagrama-1">
    <mxGraphModel dx="800" dy="600" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="850" pageHeight="1100" math="0" shadow="0">
      <root>
        ${cells.join("\n        ")}
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>`;
}

/**
 * Parsea un XML de draw.io y devuelve { message, operations } — el mismo
 * contrato que usan el asistente de IA (texto) y el de imagen, así que
 * el resultado se aplica con la misma función applyOperations() del editor.
 */
export function parseDrawioXml(xmlString) {
  const doc = new DOMParser().parseFromString(xmlString, "text/xml");

  if (doc.querySelector("parsererror")) {
    return { message: "El archivo no es un XML válido.", operations: [] };
  }

  const cells = Array.from(doc.querySelectorAll("mxCell"));
  const tableCells = cells.filter((c) => (c.getAttribute("style") || "").includes("shape=table;"));

  if (tableCells.length === 0) {
    return {
      message: "No encontré ninguna tabla de entidad en el archivo (¿es un diagrama de datos exportado desde acá o desde draw.io con shapes de tabla?).",
      operations: [],
    };
  }

  const operations = [];
  const idToEntityName = {};

  tableCells.forEach((tableCell) => {
    const tableId = tableCell.getAttribute("id");
    const entityName = tableCell.getAttribute("value") || "EntidadSinNombre";
    idToEntityName[tableId] = entityName;
    operations.push({ type: "ADD_ENTITY", name: entityName });

    const rows = cells.filter((c) => c.getAttribute("parent") === tableId);
    rows.forEach((row) => {
      const rowId = row.getAttribute("id");
      const rowChildren = cells.filter((c) => c.getAttribute("parent") === rowId);
      if (rowChildren.length === 0) return;

      const rawName = rowChildren[0].getAttribute("value") || "";
      const isPrimaryKey = rawName.includes("🔑");
      const unique = rawName.includes("◆");
      const cleanName = rawName.replace(/[🔑◆]/g, "").trim();
      const dataType = rowChildren[1]?.getAttribute("value")?.trim() || "String";

      if (cleanName) {
        operations.push({
          type: "ADD_ATTRIBUTE",
          entityName,
          name: cleanName,
          dataType,
          isPrimaryKey,
          unique,
        });
      }
    });
  });

  const edgeCells = cells.filter((c) => c.getAttribute("edge") === "1");
  edgeCells.forEach((edge) => {
    const fromEntity = idToEntityName[edge.getAttribute("source")];
    const toEntity = idToEntityName[edge.getAttribute("target")];
    if (!fromEntity || !toEntity) return;

    const [fromRole, toRole] = (edge.getAttribute("value") || "").split("/").map((s) => s.trim());

    operations.push({
      type: "ADD_RELATIONSHIP",
      fromEntity,
      toEntity,
      relType: "ONE_TO_MANY",
      fromRole: fromRole || "items",
      toRole: toRole || "padre",
    });
  });

  return {
    message: `Importé ${tableCells.length} entidad(es) y ${edgeCells.length} relación(es) desde el archivo draw.io.`,
    operations,
  };
}