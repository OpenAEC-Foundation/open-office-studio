export type DatabaseUitvoer = (
  naam: string,
  inhoud: string,
  type: string,
) => Promise<
  | { status: "opgeslagen"; pad: string }
  | { status: "download" }
  | { status: "geannuleerd" }
>;

export const downloadDatabaseUitvoer: DatabaseUitvoer = async (
  naam,
  inhoud,
  type,
) => {
  const url = URL.createObjectURL(new Blob([inhoud], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = naam;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return { status: "download" };
};
