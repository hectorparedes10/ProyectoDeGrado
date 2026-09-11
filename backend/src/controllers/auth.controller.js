const db = require('../config/db');

const login = async (req, res) => {
  try {
    const { usuario, password } = req.body;

    if (!usuario || !password) {
      return res.status(400).json({ 
        ok: false, 
        error: 'El usuario y la contraseña son requeridos.' 
      });
    }

    const usr = usuario.trim();
    const pass = password.trim();

    // Consulta en tu tabla usuarios_sistema
    const query = 'SELECT * FROM usuarios_sistema WHERE LOWER(email) = LOWER($1) OR LOWER(nombre) = LOWER($1);';
    const { rows } = await db.query(query, [usr]);

    if (rows.length === 0) {
      return res.status(401).json({ ok: false, error: 'Usuario no registrado.' });
    }

    const user = rows[0];

    // Compara directamente contra tu columna password_hash
    if (user.password_hash !== pass) {
      return res.status(401).json({ ok: false, error: 'Contraseña incorrecta.' });
    }

    if (user.activo === false) {
      return res.status(403).json({ ok: false, error: 'Usuario inactivo.' });
    }

    return res.json({
      ok: true,
      data: {
        id: user.id,
        nombre: user.nombre,
        email: user.email,
        rol: user.rol,
        token: 'token-cyber-sports-pg'
      }
    });
  } catch (error) {
    console.error('Error en login:', error);
    return res.status(500).json({ ok: false, error: error.message });
  }
};

module.exports = { login };
