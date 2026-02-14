using System;
using System.Web.Services;
using System.Collections.Generic;
using System.Data.SqlClient;
using System.Configuration;

public partial class GuardarRifas : System.Web.UI.Page
{
    // ESTE ES EL MÉTODO QUE TE FALTABA PARA QUE EL JS NO SE QUEDE "CARGANDO"
    [WebMethod]
    public static object CargarTodoFull()
    {
        try
        {
            string connStr = ConfigurationManager.ConnectionStrings["TuConexionSomee"].ConnectionString;
            var infoGeneral = new Dictionary<string, string>();
            var tablasDic = new Dictionary<string, dynamic>();

            using (SqlConnection conn = new SqlConnection(connStr))
            {
                conn.Open();

                // 1. Cargar Banner Principal
                string sqlG = "SELECT TOP 1 NombreRifa, Premio, ValorPuesto, FechaSorteo FROM Rifas_Config";
                using (SqlCommand cmd = new SqlCommand(sqlG, conn)) {
                    using (SqlDataReader dr = cmd.ExecuteReader()) {
                        if (dr.Read()) {
                            infoGeneral["n"] = dr["NombreRifa"].ToString();
                            infoGeneral["p"] = dr["Premio"].ToString();
                            infoGeneral["c"] = dr["ValorPuesto"].ToString();
                            infoGeneral["f"] = dr["FechaSorteo"] != DBNull.Value ? 
                                Convert.ToDateTime(dr["FechaSorteo"]).ToString("yyyy-MM-dd") : "";
                        }
                    }
                }

                // 2. Cargar Tablas y Participantes (Todo de un solo golpe)
                string sqlT = "SELECT TablaId, TituloTabla, Numero, NombreParticipante, EstadoPago FROM Rifas_Detalle ORDER BY TablaId, Numero";
                using (SqlCommand cmd = new SqlCommand(sqlT, conn)) {
                    using (SqlDataReader dr = cmd.ExecuteReader()) {
                        while (dr.Read()) {
                            string tId = dr["TablaId"].ToString();
                            if (!tablasDic.ContainsKey(tId)) {
                                tablasDic[tId] = new {
                                    id = tId,
                                    titulo = dr["TituloTabla"].ToString(),
                                    participantes = new Dictionary<string, object>()
                                };
                            }
                            var tabla = tablasDic[tId];
                            tabla.participantes[dr["Numero"].ToString()] = new {
                                nombre = dr["NombreParticipante"].ToString(),
                                pago = Convert.ToBoolean(dr["EstadoPago"])
                            };
                        }
                    }
                }
            }
            return new { info = infoGeneral, tablas = new List<dynamic>(tablasDic.Values) };
        }
        catch (Exception ex) { return new { error = ex.Message }; }
    }

    [WebMethod]
    public static string ActualizarDato(string tablaId, string num, object valor, string tipo)
    {
        try {
            string connStr = ConfigurationManager.ConnectionStrings["TuConexionSomee"].ConnectionString;
            using (SqlConnection conn = new SqlConnection(connStr)) {
                conn.Open();
                string campo = (tipo == "nombre") ? "NombreParticipante" : "EstadoPago";
                string sql = $@"UPDATE Rifas_Detalle SET {campo} = @val 
                               WHERE TablaId = @tid AND Numero = @num";

                using (SqlCommand cmd = new SqlCommand(sql, conn)) {
                    cmd.Parameters.AddWithValue("@val", valor);
                    cmd.Parameters.AddWithValue("@tid", tablaId);
                    cmd.Parameters.AddWithValue("@num", num);
                    int filas = cmd.ExecuteNonQuery();
                    
                    if (filas == 0) {
                        return ProcesarGuardado(tablaId, num, 
                            (tipo == "nombre" ? valor.ToString() : ""), 
                            (tipo == "pago" ? Convert.ToBoolean(valor) : false), 
                            "Nueva Tabla");
                    }
                }
            }
            return "ok";
        } catch (Exception ex) { return ex.Message; }
    }

    private static string ProcesarGuardado(string tablaId, string numero, string nombre, bool pagado, string titulo) {
        try {
            string connStr = ConfigurationManager.ConnectionStrings["TuConexionSomee"].ConnectionString;
            using (SqlConnection conn = new SqlConnection(connStr)) {
                string sql = @"
                    MERGE INTO Rifas_Detalle AS target
                    USING (SELECT @tid as tid, @num as num) AS source
                    ON (target.TablaId = source.tid AND target.Numero = source.num)
                    WHEN MATCHED THEN 
                        UPDATE SET NombreParticipante = @nom, EstadoPago = @pago, TituloTabla = @tit
                    WHEN NOT MATCHED THEN
                        INSERT (TablaId, Numero, NombreParticipante, EstadoPago, TituloTabla)
                        VALUES (@tid, @num, @nom, @pago, @tit);";

                SqlCommand cmd = new SqlCommand(sql, conn);
                cmd.Parameters.AddWithValue("@tid", tablaId);
                cmd.Parameters.AddWithValue("@num", numero);
                cmd.Parameters.AddWithValue("@nom", nombre);
                cmd.Parameters.AddWithValue("@pago", pagado);
                cmd.Parameters.AddWithValue("@tit", titulo);
                conn.Open();
                cmd.ExecuteNonQuery();
            }
            return "ok";
        } catch (Exception ex) { return ex.Message; }
    }
}