using System;
using System.Web.Services;
using System.Data.SqlClient;
using System.Configuration;

public partial class GuardarRifas : System.Web.UI.Page
{
    // Este método es el que ya tenías, lo dejamos para compatibilidad
    [WebMethod]
    public static string GuardarCelda(string tablaId, string numero, string nombre, bool pagado, string titulo)
    {
        return ProcesarGuardado(tablaId, numero, nombre, pagado, titulo);
    }

    // NUEVO MÉTODO: Para que coincida exactamente con lo que envía el JS en cada cambio
    [WebMethod]
    public static string ActualizarDato(string tablaId, string num, object valor, string tipo)
    {
        try {
            // Necesitamos los datos actuales de la celda para no sobreescribir con vacíos
            // Pero para simplificar y que funcione YA, vamos a hacer un UPDATE directo según el tipo
            string connStr = ConfigurationManager.ConnectionStrings["TuConexionSomee"].ConnectionString;
            using (SqlConnection conn = new SqlConnection(connStr)) {
                conn.Open();
                string campo = (tipo == "nombre") ? "NombreParticipante" : "EstadoPago";
                
                // Si el tipo es pago, el valor viene como bool, si es nombre como string
                string sql = $@"UPDATE Rifas_Detalle SET {campo} = @val 
                               WHERE TablaId = @tid AND Numero = @num";

                using (SqlCommand cmd = new SqlCommand(sql, conn)) {
                    cmd.Parameters.AddWithValue("@val", valor);
                    cmd.Parameters.AddWithValue("@tid", tablaId);
                    cmd.Parameters.AddWithValue("@num", num);
                    int filas = cmd.ExecuteNonQuery();
                    
                    // Si no existía la fila (filas == 0), usamos tu MERGE original
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

    // Función privada para reutilizar tu lógica de MERGE
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