/**
 * Si la URL ya tiene ?project=algo, lo usamos (significa que alguien nos
 * compartió un link a un proyecto existente). Si no, generamos uno nuevo y
 * lo agregamos a la URL sin recargar la página, para que a partir de ahora
 * el link de esta pestaña ya sea compartible.
 */
export function getOrCreateProjectId() {
  const params = new URLSearchParams(window.location.search);
  let projectId = params.get("project");

  if (!projectId) {
    projectId = Math.random().toString(36).slice(2, 10);
    params.set("project", projectId);
    const newUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState(null, "", newUrl);
  }

  return projectId;
}