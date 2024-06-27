import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

admin.initializeApp();

const firestore = admin.firestore();

// sp
export const insertarEstudiante=functions.https.onRequest(async (req, res) => {
  try {
    const {nombre, apellidos, carne, correo, telefono} = req.body;

    if (!nombre || !apellidos || !carne || !correo || !telefono) {
      res.status(400).send("Faltan campos obligatorios.");
      return;
    }

    await firestore.runTransaction(async (transaction) => {
      const estudianteData = {
        Nombre: nombre,
        Apellidos: apellidos,
        Carne: carne,
        Correo: correo,
        Telefono: telefono,
        Activo: false,
      };

      const estudianteDocRef = firestore.collection("Estudiante").doc();
      transaction.set(estudianteDocRef, estudianteData);

      const TextoBitacora=`Se insertó el estudiante con 
        ID: ${estudianteDocRef.id}`;
      await escribirEnBitacora(TextoBitacora);

      return estudianteDocRef.id;
    }).then((estudianteId) => {
      res.status(200).send(`Estudiante creado con ID: ${estudianteId}`);
    }).catch((error) => {
      res.status(500).send("Error interno del servidor. "+error);
    });
  } catch (error) {
    res.status(500).send("Error interno del servidor. "+error);
  }
});

// sp
export const activarEst=functions.https.onRequest(async (req, res) => {
  try {
    const {carne} = req.body;

    if (!carne) {
      res.status(400).send("Faltan campos obligatorios.");
      return;
    }

    await firestore.runTransaction(async (transaction) => {
      const estudiantesRef = firestore.collection("Estudiante");
      const query = estudiantesRef.where("Carne", "==", carne);
      const snapshot = await transaction.get(query);

      if (snapshot.empty) {
        return res.status(404).send("No se encontró al estudiante.");
      }

      snapshot.forEach((doc) => {
        transaction.update(doc.ref, {Activo: true});
      });

      return carne;
    }).then((carne) => {
      res.status(200).send(`Estudiante con Carné: ${carne} se ha activado`);
    }).catch((error) => {
      res.status(500).send("Error interno del servidor. "+error);
    });
  } catch (error) {
    res.status(500).send("Error interno del servidor. "+error);
  }
});

// sp
export const desactivarEst=functions.https.onRequest(async (req, res) => {
  try {
    const {carne} = req.body;

    if (!carne) {
      res.status(400).send("Faltan campos obligatorios.");
      return;
    }

    await firestore.runTransaction(async (transaction) => {
      const estudiantesRef = firestore.collection("Estudiante");
      const query = estudiantesRef.where("Carne", "==", carne);
      const snapshot = await transaction.get(query);

      if (snapshot.empty) {
        return res.status(404).send("No se encontró al estudiante.");
      }

      snapshot.forEach((doc) => {
        transaction.update(doc.ref, {Activo: false});
      });

      return carne;
    }).then((carne) => {
      res.status(200).send(`Estudiante con Carné: ${carne} se ha desactivado`);
    }).catch((error) => {
      res.status(500).send("Error interno del servidor. "+error);
    });
  } catch (error) {
    res.status(500).send("Error interno del servidor. "+error);
  }
});

// sp
export const obtenerNotificacionesNoEnviadas = functions.https
  .onRequest(async (req, res) => {
    try {
      const notificacionesRef = firestore.collection("Notificacion");
      const querySs = await notificacionesRef.where("Enviado", "==", false)
        .get();

      const notificaciones: {id: string, Asunto: string,
        Cuerpo: string, Correo: string}[] = [];
      querySs.forEach((doc) => {
        const data = doc.data();
        notificaciones.push({
          id: doc.id,
          Asunto: data.Asunto,
          Cuerpo: data.Cuerpo,
          Correo: data.Correo,
        });
      });

      res.status(200).json(notificaciones);
    } catch (error) {
      res.status(500).send("Error interno del servidor."+error);
    }
  });

// sp
export const marcarNotificacionEnviada = functions.https
  .onRequest(async (req, res) => {
    try {
      const {id} = req.body;
      await firestore.runTransaction(async (transaction) => {
        const notificacionRef = firestore.collection("Notificacion").doc(id);
        const snapshot = await transaction.get(notificacionRef);

        if (!snapshot.exists) {
          throw new Error("Notificación no encontrada.");
        }

        transaction.update(notificacionRef, {
          Enviado: true,
          FechaEnvio: admin.firestore.FieldValue.serverTimestamp(),
        });
        const TextoBitacora=`Se envio la notificacion con
            ID: ${id}`;
        await escribirEnBitacora(TextoBitacora);
      });
    } catch (error) {
      res.status(500).send("Error al marcar notificación como enviada:"+
        error);
    }
  });

// trigger
export const estudianteEstadoNotificacion = functions.firestore
  .document("Estudiante/{estudianteId}")
  .onUpdate(async (change, context) => {
    const beforeData = change.before.data();
    const afterData = change.after.data();
    const estudianteId = context.params.estudianteId;

    if (beforeData.Activo !== afterData.Activo) {
      try {
        await firestore.runTransaction(async (transaction) => {
          const usuarioSnapshot = await transaction.get(
            firestore.collection("Usuario")
              .where("EstudianteRef", "==", firestore
                .doc(`/Estudiante/${estudianteId}`))
          );

          const usuarioDoc = usuarioSnapshot.docs[0];
          const usuarioData = usuarioDoc.data();

          let TextoBitacora="";
          const notificacionData = {
            Correo: beforeData.Correo,
            Asunto: "",
            Cuerpo: "",
            FechaRegistro: admin.firestore.FieldValue.serverTimestamp(),
            Enviado: false,
            FechaEnvio: null,
          };
          if (beforeData.Activo === false && afterData.Activo === true) {
            notificacionData.Asunto = "Activacion de cuenta estudiante";
            notificacionData.Cuerpo = `<html><header></header><body><h4>
            Su cuenta ha sido activada correctamente,</h4><br>
            <p>Datos de su cuenta:<ul>
            <li>Usuario: </li><b>${usuarioData.Usuario}}</b>
            <li>Contraseña: </li><b>${usuarioData.Password}}</b>
            </ul></p><p>
            Disfruta de los medios electronicos proporcionados
            por la universidad
            </p></body></html>`;
            TextoBitacora=`Se activo el estudiante con 
            ID: ${estudianteId}`;
          } else if (beforeData.Activo === true && afterData.Activo === false) {
            notificacionData.Asunto = "Desactivacion de cuenta estudiante";
            notificacionData.Cuerpo = `<html><header></header><body><h4>
            Su cuenta ha sido desactivada</h4><br>
            <p>Datos de su cuenta desactivada:<ul>
            <li>Usuario: </li><b>${usuarioData.Usuario}}</b>
            </ul></p><p>
            Tienes que activar tu cuenta para usar los medios electronicos
            proporcionados por la universidad</p></body></html>`;
            TextoBitacora=`Se desactivo el estudiante con 
              ID: ${estudianteId}`;
          }
          const notificacionDocRef = firestore.collection("Notificacion").doc();
          transaction.set(notificacionDocRef, notificacionData);

          await escribirEnBitacora(TextoBitacora);
        });
      } catch (error) {
        throw new Error("Error al registrar notificacion. Server "+
            error);
      }
    }
  });

// trigger
export const estudianteRegistroNofiticacion=functions.firestore
  .document("Estudiante/{estudianteId}")
  .onCreate(async (snap) => {
    const estudiante = snap.data();

    try {
      await firestore.runTransaction(async (transaction) => {
        const notificacionData = {
          Correo: estudiante.Correo,
          Asunto: "Registro de un nuevo estudiante",
          Cuerpo: `<html><header></header><body><h4>
            Bienvenido a la universiad,</h4><br>
            <b><h2>${estudiante.Nombre}</h2></b>
            <p>Datos registrados:<ul>
            <li>Carne: </li><b>${estudiante.Carne}</b>
            <li>Telefono: </li><b>${estudiante.Telefono}</b>
            <li>Correo: </li><b>${estudiante.Correo}</b>
            </ul></p><p>Debe activar su cuenta para utilizar los medios
            electronicos de la universidad</p></body></html>`,
          FechaRegistro: admin.firestore.FieldValue.serverTimestamp(),
          Enviado: false,
          FechaEnvio: null,
        };
        const notificacionDocRef = firestore.collection("Notificacion").doc();
        transaction.set(notificacionDocRef, notificacionData);

        const TextoBitacora=`Se inserto la notificacion con 
          ID: ${notificacionDocRef.id}`;
        await escribirEnBitacora(TextoBitacora);
      });
    } catch (error) {
      throw new Error("Error al crear notificación. Transacción abortada. "+
        error);
    }
  });

// trigger
export const estudianteRegistroUsuario=functions.firestore
  .document("Estudiante/{estudianteId}")
  .onCreate(async (snap, context) => {
    const estudiante = snap.data();
    const estudianteId = context.params.estudianteId;

    try {
      await firestore.runTransaction(async (transaction) => {
        const apellidos = estudiante.Apellidos;

        const apellidosSinEspacios = apellidos.replace(/\s/g, "");

        const usuario = `${estudiante.Nombre}.${apellidosSinEspacios}`;

        const usuarioData = {
          EstudianteRef: firestore.doc(`Estudiante/${estudianteId}`),
          Usuario: usuario,
          Password: "ContraseñaTemporal",
        };
        const usuarioDocRef = firestore.collection("Usuario").doc();
        transaction.set(usuarioDocRef, usuarioData);

        const TextoBitacora=`Se inserto el usuario con 
            ID: ${usuarioDocRef.id}`;
        await escribirEnBitacora(TextoBitacora);
      });
    } catch (error) {
      throw new Error("Error al crear usuario. Transacción abortada. "+error);
    }
  });

/**
 * Escribe un registro en la colección Bitacora de Firestore.
 * @param {string} Texto - El texto a registrar en la bitácora.
 * @throws {Error} Si hay un error al escribir en la bitácora.
 */
export async function escribirEnBitacora(Texto: string) {
  try {
    await firestore.runTransaction(async (transaction) => {
      const docRef = firestore.collection("Bitacora").doc();
      const bitacoraData = {
        Texto: Texto,
        FechaBitacora: admin.firestore.FieldValue.serverTimestamp(),
      };
      transaction.set(docRef, bitacoraData);
    });
  } catch (error) {
    console.error("Error al escribir en bitácora:", error);
    throw new Error("Error al escribir en bitácora. Transacción abortada");
  }
}
