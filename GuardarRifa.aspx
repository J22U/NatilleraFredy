using System;
using System.Web.Services;
using System.Collections.Generic;
using System.Data.SqlClient;
using System.Configuration;
using System.Web.Script.Serialization;

public partial class ObtenerRifas : System.Web.UI.Page
{
    [WebMethod]
    public static object CargarDatos()
    {
        try
        {
            string connStr = ConfigurationManager.ConnectionStrings["TuConexionSomee"].ConnectionString;
            var infoGeneral = new Dictionary<string, string>();
            var tablas = new List<object>();

            using (SqlConnection conn = new SqlConnection(connStr))
            {
                conn.Open();

                // 1. Cargar Info General (Banner)
                string sqlG = "SELECT TOP 1 NombreRifa, Premio, ValorPuesto, FechaSorteo FROM Rifas_Config";
                using (SqlCommand cmd = new SqlCommand(sqlG, conn)) {
                    using (SqlDataReader dr = cmd.ExecuteReader()) {
                        if (dr.Read()) {
                            infoGeneral["n"] = dr["NombreRifa"].ToString();
                            infoGeneral["p"] = dr["Premio"].ToString();
                            infoGeneral["c"] = dr["ValorPuesto"].ToString();
                            infoGeneral["f"] = Convert.ToDateTime(dr["FechaSorteo"]).ToString("yyyy-MM-dd");
                        }
                    }
                }

                // 2. Cargar Tablas y sus Participantes
                // Agrupamos por TablaId para reconstruir la estructura
                string sqlT = "SELECT DISTINCT TablaId, TituloTabla FROM Rifas_Detalle";
                using (SqlCommand cmd = new SqlCommand(sqlT, conn)) {
                    using (SqlDataReader dr = cmd.ExecuteReader()) {
                        while (dr.Read()) {
                            string tId = dr["TablaId"].ToString();
                            string titulo = dr["TituloTabla"].ToString();
                            tablas.Add(new { id = tId, titulo = titulo });
                        }
                    }
                }
            }
            return new { info = infoGeneral, tablas = tablas };
        }
        catch (Exception ex) { return new { error = ex.Message }; }
    }

    [WebMethod]
    public static object ObtenerParticipantes(string tablaId)
    {
        // Función auxiliar para traer los 100 números de una tabla específica
        var participantes = new Dictionary<string, object>();
        string connStr = ConfigurationManager.ConnectionStrings["TuConexionSomee"].ConnectionString;
        
        using (SqlConnection conn = new SqlConnection(connStr)) {
            string sqlP = "SELECT Numero, NombreParticipante, EstadoPago FROM Rifas_Detalle WHERE TablaId = @tid";
            SqlCommand cmd = new SqlCommand(sqlP, conn);
            cmd.Parameters.AddWithValue("@tid", tablaId);
            conn.Open();
            using (SqlDataReader dr = cmd.ExecuteReader()) {
                while (dr.Read()) {
                    participantes[dr["Numero"].ToString()] = new {
                        nombre = dr["NombreParticipante"].ToString(),
                        pago = Convert.ToBoolean(dr["EstadoPago"])
                    };
                }
            }
        }
        return participantes;
    }
}